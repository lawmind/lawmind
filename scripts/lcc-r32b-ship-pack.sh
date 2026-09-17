#!/usr/bin/env bash
# LCC R32B — ship a release pack to the Gate-C corpus host WHILE it is exported.
#
# The exporter writes one table at a time and prints one line per finished
# table. This polls that log and streams each finished file over SSH as soon as
# it is complete, so the ~11.5 MB/s uplink works in parallel with the export
# instead of after it. The manifest is shipped last, only once the exporter has
# printed its completion line.
#
# Integrity: every file's sha256 is computed on BOTH ends and must match; the
# manifest's own sha256 file is checked remotely. release-restore-cli then
# re-checks every file against the manifest before it truncates anything.
#
# usage: lcc-r32b-ship-pack.sh <local-pack-dir> <export-log> <user@host> <remote-dir> <ssh-key> <known-hosts>
set -u
PACK=$1 LOG=$2 HOST=$3 RDIR=$4 KEY=$5 KH=$6
SSH=(ssh -i "$KEY" -o UserKnownHostsFile="$KH" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30)
SHIPPED="$PACK/../shipped.txt"
touch "$SHIPPED"
say() { echo "$(date -u +%FT%TZ) $*"; }

"${SSH[@]}" "$HOST" "mkdir -p '$RDIR'" || { say "cannot create $RDIR"; exit 1; }

ship() {
  local f=$1 attempt local_sum remote_sum
  local_sum=$(sha256sum "$PACK/$f" | cut -d' ' -f1)
  # Already there, byte-identical (a re-export of unchanged data): do not resend.
  remote_sum=$("${SSH[@]}" "$HOST" "test -f '$RDIR/$f' && sha256sum '$RDIR/$f' | cut -d' ' -f1" || true)
  if [ "$local_sum" = "$remote_sum" ]; then
    say "ALREADY_PRESENT $f sha256=$local_sum"
    echo "$f" >> "$SHIPPED"
    return 0
  fi
  for attempt in 1 2 3; do
    local t0=$(date +%s)
    if "${SSH[@]}" "$HOST" "cat > '$RDIR/$f.part' && mv '$RDIR/$f.part' '$RDIR/$f'" < "$PACK/$f"; then
      remote_sum=$("${SSH[@]}" "$HOST" "sha256sum '$RDIR/$f' | cut -d' ' -f1")
      if [ "$local_sum" = "$remote_sum" ]; then
        local bytes=$(stat -c %s "$PACK/$f") secs=$(( $(date +%s) - t0 ))
        say "SHIPPED $f bytes=$bytes secs=$secs sha256=$local_sum"
        echo "$f" >> "$SHIPPED"
        return 0
      fi
      say "MISMATCH $f attempt=$attempt local=$local_sum remote=$remote_sum"
    else
      say "TRANSFER_FAILED $f attempt=$attempt"
    fi
    sleep 20
  done
  say "GIVING_UP $f"
  return 1
}

while :; do
  # A line per finished table: "  <table>  <rows> rows  <md5>  <bytes> bytes  <iso>"
  for t in $(grep -E '^\s+[a-z_]+\s+[0-9]+ rows' "$LOG" 2>/dev/null | awk '{print $1}'); do
    f="$t.copy.gz"
    grep -qx "$f" "$SHIPPED" && continue
    ship "$f" || exit 1
  done
  if grep -q '^release .* written to' "$LOG" 2>/dev/null; then
    # The table list above was read BEFORE any shipping in this pass. Tables
    # that finished while a big file was uploading are not in it, and the first
    # version sent the manifest without them (LCC R32B). Loop again until every
    # table the finished log names is shipped.
    pending=0
    for t in $(grep -E '^\s+[a-z_]+\s+[0-9]+ rows' "$LOG" | awk '{print $1}'); do
      grep -qx "$t.copy.gz" "$SHIPPED" || pending=1
    done
    [ "$pending" = 1 ] && continue
    for f in MANIFEST.json MANIFEST.sha256; do
      grep -qx "$f" "$SHIPPED" || ship "$f" || exit 1
    done
    "${SSH[@]}" "$HOST" "cd '$RDIR' && sha256sum -c MANIFEST.sha256" && say "MANIFEST_VERIFIED" && say "DONE" && exit 0
    say "MANIFEST_CHECK_FAILED"; exit 1
  fi
  if grep -qiE 'error|refusing' "${LOG%.log}.err" 2>/dev/null; then
    say "EXPORT_ERROR_SEEN"; exit 1
  fi
  sleep 60
done
