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

run() { # run <hook> <session_id> [extra json]
  printf '{"session_id":"%s"%s}' "$2" "${3:-}" \
    | env -u LAWMIND_LANE CLAUDE_PROJECT_DIR="$TMP" bash "$HOOKS/$1" 2>/dev/null
}

echo 'lane bus regression'

# ── 1 · a lane name containing a digit resolves ───────────────────────────────
# `tr -cd 'A-Za-z'` ate the digit, so NEW1 read as "NEW", matched nothing, and
# three correctly-bound lanes were told they were unbound for weeks.
for lane in LCC RCC NEW1 NEW2 NEW3; do
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
printf 'NEW1\n' > "$BUSDIR/.lane-$sid"
TOTAL=25
for i in $(seq 1 $TOTAL); do mk "$i" LCC NEW1 $((i * 300)); done

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
  key="$(printf '%04d--LCC-to-NEW1--subject.md' "$i")"
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

mk 90 NEW2 NEW1 200
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
mk 91 NEW2 NEW1 200
out="$(run lane-wake.sh "$sid" ',"stop_hook_active":true')"
[ -z "$out" ] && ok "wake: honours stop_hook_active" \
  || no "wake: honours stop_hook_active" "blocked while already continuing"

# ── 8 · the emitted JSON is valid ────────────────────────────────────────────
# Messages are arbitrary markdown full of quotes and backslashes; hand-rolled
# shell escaping is exactly how that breaks.
printf 'a "quoted" \\ backslash\n\ttab and $dollar `backtick`\n' \
  > "$BUSDIR/0092--NEW2-to-NEW1--nasty.md"
out="$(run lane-wake.sh "$sid")"
if printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s);process.exit(0)})' 2>/dev/null; then
  ok "wake: emits valid JSON for messages with quotes and backslashes"
else
  no "wake: emits valid JSON" "unparseable: ${out:0:200}"
fi

# ── 9 · an unbound session is never woken ────────────────────────────────────
# A Stop hook that blocked a stranger's session would trap it in a loop over
# mail that is not theirs.
mk 93 LCC NEW1 200
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

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
