#!/usr/bin/env bash
# Regression test for the lane bus hooks. `bash scripts/lane-bus.test.sh`
#
# Every case here is a bug that actually shipped and was found by hand. The
# expensive one — messages silently destroyed by a cursor that advanced past
# what it never showed — was invisible to any check that looked at ONE delivery
# and saw a plausible payload. It only appears when you drain a backlog to empty
# and count. So that is what this does.
#
# Runs against a throwaway bus in a temp directory. Never touches .agents/bus.

set -uo pipefail
HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.claude/hooks" && pwd)"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
no() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.agents/bus"
BUSDIR="$TMP/.agents/bus"

# A message big enough that several will not fit one 8,000-char payload, so the
# budget path is genuinely exercised rather than assumed.
mk() { # mk <seq> <from> <to> <size>
  printf '0%03d--%s-to-%s--subject.md' "$1" "$2" "$3" >/dev/null
  local f
  f="$(printf '%s/%04d--%s-to-%s--subject.md' "$BUSDIR" "$1" "$2" "$3")"
  { printf 'from %s to %s seq %s\n' "$2" "$3" "$1"
    head -c "$4" /dev/zero | tr '\0' 'x'
    printf '\n'
  } > "$f"
}

# ---------------------------------------------------------------------------
# WHAT THE HOOK EMITS DEPENDS ON WHETHER `jq` IS INSTALLED
# ---------------------------------------------------------------------------
#
# `lane-bus.sh` prints its payload as plain text when jq is absent, and as ONE
# LINE of JSON - {hookSpecificOutput:{additionalContext: "..."}} - when jq is
# present. Both are correct; Claude Code reads the JSON form.
#
# This file was written on a workstation with no jq, so every assertion below
# read the plain form. The drain loop in case 2 counts with
# `grep -c -- '--- message '` and extracts names with a GREEDY sed. Against one
# line of JSON both collapse: grep counts 1 per delivery, and the greedy sed
# keeps only the LAST name on the line. The first CI run on a runner that HAS jq
# reported "delivered 16, distinct 16, expected 25" and named nine messages as
# never delivered - one survivor per round. The bus was correct the whole time;
# the test could not see it.
#
# So `run` normalises: when the hook emitted the JSON envelope, unwrap
# `additionalContext` into the text it carries. `lane-wake.sh` emits
# {decision, reason}, which has no such key and passes through untouched, so the
# JSON-validity assertion in case 8 still grades the real bytes.
unwrap() { # stdin -> the delivered text, from either payload form
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const c=j&&j.hookSpecificOutput&&j.hookSpecificOutput.additionalContext;if(typeof c==="string"){process.stdout.write(c);return;}}catch(e){}process.stdout.write(s);});'
}

run() { # run <hook> <session_id> [extra json]
  run_raw "$@" | unwrap
}

# The raw bytes, for the cases that have to grade the envelope itself.
run_raw() { # run_raw <hook> <session_id> [extra json]
  printf '{"session_id":"%s"%s}' "$2" "${3:-}" \
    | env -u LAWMIND_LANE CLAUDE_PROJECT_DIR="$TMP" bash "$HOOKS/$1" 2>/dev/null
}

echo 'lane bus regression'

# ── 1 · every ACTIVE lane binds and receives ─────────────────────────────────
# Since v7.4 A1 the active lanes are SHIP DATA RED. The historical digit bug
# (`tr -cd 'A-Za-z'` turned NEW1 into "NEW", so three correctly-bound lanes were
# told they were unbound for weeks) stays guarded by case 10, and by case 11,
# which recognises a digit-named LEGACY binding by name — only possible if the
# digit survives the sanitiser.
for lane in SHIP DATA RED; do
  sid="sess-$lane"
  printf '%s\n' "$lane" > "$BUSDIR/.lane-$sid"
  mk 1 LCC "$lane" 100
  out="$(run lane-bus.sh "$sid")"
  if printf '%s' "$out" | grep -q 'UNBOUND'; then
    no "$lane binds" "reported UNBOUND with .lane-$sid containing $lane"
  else
    ok "$lane binds and receives"
  fi
  rm -f "$BUSDIR/.cursor-$(printf '%s' "$lane" | tr '[:upper:]' '[:lower:]')"
  rm -f "$BUSDIR"/*-to-"$lane"--*.md
done

# ── 2 · a real backlog drains without losing one message ─────────────────────
# The cursor advanced to the highest sequence READ, not SHOWN: 22 pending, 4
# displayed, all 22 marked delivered. Then the first fix skipped an over-budget
# message and let a smaller later one through, so the cursor jumped the gap and
# lost 9 more. Draining and counting is the only check that sees either.
sid=sess-drain
printf 'DATA\n' > "$BUSDIR/.lane-$sid"
TOTAL=25
for i in $(seq 1 $TOTAL); do mk "$i" SHIP DATA $((i * 300)); done

seen=0
rounds=0
declare -A got=()
while [ "$rounds" -lt 60 ]; do
  rounds=$((rounds + 1))
  out="$(run lane-bus.sh "$sid")"
  n="$(printf '%s' "$out" | grep -c -- '--- message ')"
  [ "$n" -eq 0 ] && break
  while read -r m; do got["$m"]=1; done < <(printf '%s' "$out" | sed -n 's/.*--- message \(.*\) ---.*/\1/p')
  seen=$((seen + n))
done

if [ "$seen" -eq "$TOTAL" ] && [ "${#got[@]}" -eq "$TOTAL" ]; then
  ok "backlog of $TOTAL drained in $((rounds - 1)) deliveries, none lost, none duplicated"
else
  no "backlog drains without loss" "delivered $seen, distinct ${#got[@]}, expected $TOTAL"
fi

# ── 3 · delivery is contiguous ───────────────────────────────────────────────
# A high-water cursor cannot represent a hole, so a skipped message is a lost
# one. This asserts the sequence arrives in order with no gaps.
missing=""
for i in $(seq 1 $TOTAL); do
  key="$(printf '%04d--SHIP-to-DATA--subject.md' "$i")"
  [ -n "${got[$key]:-}" ] || missing="$missing $i"
done
[ -z "$missing" ] && ok "no gaps in the delivered sequence" \
  || no "no gaps in the delivered sequence" "never delivered:$missing"

# ── 4 · nothing pending, nothing emitted ─────────────────────────────────────
out="$(run lane-bus.sh "$sid")"
[ -z "$out" ] && ok "silent when the bus is quiet" \
  || no "silent when the bus is quiet" "emitted ${#out} bytes"

# ── 5 · the Stop hook blocks only on real mail ───────────────────────────────
out="$(run lane-wake.sh "$sid")"
[ -z "$out" ] && ok "wake: does not block when there is no mail" \
  || no "wake: does not block when there is no mail" "$out"

mk 90 RED DATA 200
out="$(run lane-wake.sh "$sid")"
if printf '%s' "$out" | grep -q '"decision":"block"'; then
  ok "wake: blocks when mail arrives"
else
  no "wake: blocks when mail arrives" "got: ${out:-<empty>}"
fi

# ── 6 · the wake-up cannot spin ──────────────────────────────────────────────
# Delivery consumes, so the same message must never wake the lane twice. This is
# the guard that makes a Stop hook safe at all.
out="$(run lane-wake.sh "$sid")"
[ -z "$out" ] && ok "wake: same message never wakes twice" \
  || no "wake: same message never wakes twice" "blocked again on consumed mail"

# ── 7 · stop_hook_active is honoured ─────────────────────────────────────────
mk 91 RED DATA 200
out="$(run lane-wake.sh "$sid" ',"stop_hook_active":true')"
[ -z "$out" ] && ok "wake: honours stop_hook_active" \
  || no "wake: honours stop_hook_active" "blocked while already continuing"

# ── 8 · the emitted JSON is valid ────────────────────────────────────────────
# Messages are arbitrary markdown full of quotes and backslashes; hand-rolled
# shell escaping is exactly how that breaks.
printf 'a "quoted" \\ backslash\n\ttab and $dollar `backtick`\n' \
  > "$BUSDIR/0092--RED-to-DATA--nasty.md"
out="$(run lane-wake.sh "$sid")"
if printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.exit(0)})' 2>/dev/null; then
  ok "wake: emits valid JSON for messages with quotes and backslashes"
else
  no "wake: emits valid JSON" "unparseable: ${out:0:200}"
fi

# ── 9 · an unbound session is never woken ────────────────────────────────────
# A Stop hook that blocked a stranger's session would trap it in a loop over
# mail that is not theirs.
mk 93 SHIP DATA 200
out="$(run lane-wake.sh "no-such-session")"
[ -z "$out" ] && ok "wake: unbound session is left alone" \
  || no "wake: unbound session is left alone" "$out"

# ── 10 · lane-send.mjs's own binding resolver strips digits like the hooks ───
# `lane-send.mjs` reads `.lane-<session>` itself (a separate implementation
# from `lane-common.sh`, not a caller of it) so it did not inherit Q1.37's
# fix when that fix landed. It used `/[^A-Za-z]/g`, which turned "NEW1" back
# into "NEW" and made every send from a digit-named lane fail with "no lane"
# even though the binding file on disk was correct. Fixed in Q1.46 to match
# `lane-status.mjs`'s `/[^A-Za-z0-9]/g`, but nothing asserted the two files
# stay in agreement — this would not have caught the bug being introduced,
# only a future re-divergence, which is exactly how it happened the first
# time (one file fixed, a second implementation of the same rule left behind).
SEND_MJS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lane-send.mjs"
STATUS_MJS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lane-status.mjs"
send_re="$(grep -o '/\[\^A-Za-z0-9\][a-z_.-]*/g' "$SEND_MJS" | tail -1)"
status_re="$(grep -o '/\[\^A-Za-z0-9\][a-z_.-]*/g' "$STATUS_MJS" | tail -1)"
if [ -n "$send_re" ] && [ "$send_re" = "$status_re" ]; then
  ok "lane-send.mjs strips like lane-status.mjs ($send_re)"
else
  no "lane-send.mjs strips like lane-status.mjs" \
    "lane-send.mjs: '${send_re:-<not found>}' vs lane-status.mjs: '${status_re:-<not found>}'"
fi

# ── 11 · a LEGACY binding is refused for new work, and says so ──────────────
# v7.4 A1: sessions bind only to SHIP/DATA/RED. A session still carrying an old
# NEW1 binding must be told it is legacy, must receive nothing, and must not
# consume the legacy lane's history by advancing its cursor.
mk 94 LCC NEW1 200
printf 'NEW1\n' > "$BUSDIR/.lane-sess-legacy"
out="$(run lane-bus.sh sess-legacy)"
if printf '%s' "$out" | grep -q 'UNBOUND' && printf '%s' "$out" | grep -q 'LEGACY lane NEW1' \
  && ! printf '%s' "$out" | grep -q -- '--- message ' && [ ! -f "$BUSDIR/.cursor-new1" ]; then
  ok "legacy NEW1 binding refused for new work, named, and consumes nothing"
else
  no "legacy binding refused" "got: ${out:0:300}"
fi
out="$(run lane-wake.sh sess-legacy)"
[ -z "$out" ] && ok "wake: a legacy-bound session is never woken" \
  || no "wake: a legacy-bound session is never woken" "$out"

# ── 12 · the unbound notice offers only the active lanes ─────────────────────
out="$(run lane-bus.sh sess-nobody)"
if printf '%s' "$out" | grep -q 'echo SHIP' && printf '%s' "$out" | grep -q 'echo DATA' \
  && printf '%s' "$out" | grep -q 'echo RED' && ! printf '%s' "$out" | grep -Eq 'echo (LCC|RCC|NEW[123])'; then
  ok "unbound notice offers SHIP/DATA/RED and no legacy lane"
else
  no "unbound notice offers only active lanes" "${out:0:300}"
fi

# ── 13 · lane-send: broadcast reaches active lanes only; legacy refused ──────
# Runs against the throwaway bus through LAWMIND_BUS_DIR, never .agents/bus.
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
seqs() { ls "$BUSDIR" | grep -E '^[0-9]{4}--' | sort; }
hash_upto() { # hash_upto <maxseq> -> sha256 of every message at or below it
  (cd "$BUSDIR" && seqs | awk -v m="$1" '(substr($0,1,4)+0) <= m' | xargs cat | sha256sum | cut -c1-64)
}
maxseq="$(seqs | tail -1 | cut -c1-4 | sed 's/^0*//')"
before="$(hash_upto "$maxseq")"
printf 'broadcast body\n' | env LAWMIND_BUS_DIR="$BUSDIR" LAWMIND_LANE=SHIP \
  node "$SCRIPTS/lane-send.mjs" ALL "topology test" >/dev/null 2>&1
new="$(seqs | awk -v m="$maxseq" '(substr($0,1,4)+0) > m')"
if [ "$(printf '%s\n' "$new" | grep -c .)" -eq 2 ] && printf '%s' "$new" | grep -q -- '--SHIP-to-DATA--' \
  && printf '%s' "$new" | grep -q -- '--SHIP-to-RED--' \
  && ! printf '%s' "$new" | grep -Eq -- '-to-(LCC|RCC|NEW[123]|FIFTH|AUDIT)'; then
  ok "ALL from SHIP fans out to DATA and RED only"
else
  no "broadcast targets only active lanes" "new files: $new"
fi
first="$(printf '%s\n' "$new" | head -1 | cut -c1-4 | sed 's/^0*//')"
[ "${first:-0}" -eq $((maxseq + 1)) ] && ok "sequence stays contiguous after the legacy history (next = $first)" \
  || no "sequence contiguous" "max legacy $maxseq, first new ${first:-none}"
printf 'x\n' | env LAWMIND_BUS_DIR="$BUSDIR" LAWMIND_LANE=SHIP \
  node "$SCRIPTS/lane-send.mjs" NEW2 "to legacy" >/dev/null 2>&1
rc=$?; [ "$rc" -eq 2 ] && ok "send to a legacy lane is refused" || no "send to a legacy lane is refused" "exit $rc"
printf 'x\n' | env LAWMIND_BUS_DIR="$BUSDIR" LAWMIND_LANE=LCC \
  node "$SCRIPTS/lane-send.mjs" DATA "from legacy" >/dev/null 2>&1
rc=$?; [ "$rc" -eq 2 ] && ok "send from a legacy lane is refused" || no "send from a legacy lane is refused" "exit $rc"
[ "$before" = "$(hash_upto "$maxseq")" ] && ok "no historical message renamed or rewritten by a send" \
  || no "historical messages untouched" "pre-existing content hash changed"

# ── 14 · historical inbox renders legacy delivery state unchanged ────────────
# A legacy message at or below its legacy cursor must still read [delivered],
# not suddenly PENDING because its lane is no longer active.
# lane-inbox reads the front-matter, so this fixture carries real front-matter
# (mk writes none), at a sequence nothing above can have used.
printf -- '---\nseq: 900\nfrom: LCC\nto: NEW2\nsentAt: 2026-09-01T00:00:00Z\nsubject: "legacy"\n---\n\nbody\n' \
  > "$BUSDIR/0900--LCC-to-NEW2--legacy.md"
printf '900\n' > "$BUSDIR/.cursor-new2"
out="$(env LAWMIND_BUS_DIR="$BUSDIR" node "$SCRIPTS/lane-inbox.mjs" 2>&1)"
if printf '%s\n' "$out" | grep -Eq '^ +0900 +LCC → NEW2 +\[delivered\] \(legacy\)'; then
  ok "lane-inbox shows a delivered legacy message as delivered (legacy)"
else
  no "historical inbox renders" "$(printf '%s\n' "$out" | grep 0900)"
fi

# -- 15 · the ENVELOPE, in whichever form this host produces ------------------
# The branch nothing ever graded. `lane-bus.sh` wraps its payload in
# {hookSpecificOutput:{additionalContext}} when jq is installed and prints it
# plain when jq is not, and this file was written where jq is not. The first CI
# run on a runner that HAS jq reported nine messages "never delivered" - a test
# artefact, not a bus defect, and it cost a red pipeline to find.
#
# ONE delivery, graded twice: the raw bytes for the envelope, and the same bytes
# through `unwrap` for the text. Calling the hook a second time would deliver
# nothing, because the first call already advanced the cursor - which is the
# whole behaviour this file exists to protect.
sid=sess-envelope
printf 'SHIP\n' > "$BUSDIR/.lane-$sid"
rm -f "$BUSDIR/.cursor-ship"
mk 950 DATA SHIP 120
env_raw="$(run_raw lane-bus.sh "$sid")"
env_text="$(printf '%s' "$env_raw" | unwrap)"
rm -f "$BUSDIR/0950--DATA-to-SHIP--subject.md"

if command -v jq >/dev/null 2>&1; then
  if printf '%s' "$env_raw" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const c=j.hookSpecificOutput.additionalContext;process.exit(typeof c==="string"&&c.includes("0950--DATA-to-SHIP--subject.md")?0:1)})' 2>/dev/null; then
    ok "envelope: jq present, payload is JSON carrying the message in additionalContext"
  else
    no "envelope: jq present" "not valid JSON with the message inside: ${env_raw:0:200}"
  fi
else
  case "$env_raw" in
    *"--- message 0950--DATA-to-SHIP--subject.md ---"*)
      ok "envelope: no jq, payload is the plain text the JSON would carry" ;;
    *) no "envelope: no jq" "plain payload did not name the message: ${env_raw:0:200}" ;;
  esac
fi

case "$env_text" in
  *"--- message 0950--DATA-to-SHIP--subject.md ---"*)
    ok "envelope: unwrap yields the same delivered text on both hosts" ;;
  *) no "envelope: unwrap normalises" "got: ${env_text:0:200}" ;;
esac

# And unwrap must handle the jq form even where jq is absent, so the branch CI
# exercises is graded on every host rather than only on the runner. The payload
# carries a newline and a double quote on purpose: those are exactly what the
# JSON envelope escapes, and exactly what a naive reader loses.
synthetic="$(node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:"--- message 0950--DATA-to-SHIP--subject.md ---\nbody with \"quotes\" in it"}}))')"
got="$(printf '%s' "$synthetic" | unwrap)"
lines="$(printf '%s' "$got" | wc -l)"
case "$got" in
  *'--- message 0950--DATA-to-SHIP--subject.md ---'*'body with "quotes" in it'*)
    [ "$lines" -ge 1 ] \
      && ok "envelope: unwrap decodes the jq form, newlines and quotes intact" \
      || no "envelope: unwrap decodes the jq form" "newline not restored: ${got:0:200}" ;;
  *) no "envelope: unwrap decodes the jq form" "got: ${got:0:200}" ;;
esac

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
