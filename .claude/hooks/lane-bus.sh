#!/usr/bin/env bash
# UserPromptSubmit hook — delivers mail addressed to this lane, on every prompt.
#
# ALWAYS EXITS 0. On UserPromptSubmit an exit 2 BLOCKS THE PROMPT AND ERASES IT,
# so every failure path degrades to "emit nothing, exit clean" — a missed
# message is an inconvenience, a swallowed prompt is not.
#
# The mechanics (lane resolution, budgeting, cursor rules) live in
# lane-common.sh so this hook and lane-wake.sh cannot drift apart. Read that
# file's header before changing anything about how a lane name is parsed.
#
# ─────────────────────────────────────────────────────────────────────────────
# HOW A SESSION LEARNS WHICH LANE IT IS — and why it is not just an env var
# ─────────────────────────────────────────────────────────────────────────────
#
# The first version identified the lane ONLY by LAWMIND_LANE. That looked fine
# and delivered nothing for a whole session, because a hook inherits the
# environment of the Claude Code PROCESS, not of the agent's shell: an agent
# that runs `export LAWMIND_LANE=LCC` in its own Bash call has changed a child
# process that exits immediately. So the binding file — keyed on the session_id
# that arrives on stdin — is what actually works, and it identifies THIS session
# and nothing else, which matters because every lane shares one working tree.
#
# When neither resolves, this does NOT guess and does NOT go quiet: it prints
# the exact command to bind, with the real session_id already filled in. The
# notice repeats every prompt until bound, which is the point — an unbound lane
# is a lane whose mail is piling up. That notice was also, for weeks, a LIE told
# to three correctly-bound lanes; see lane-common.sh bug (1).

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BUS="${PROJECT_DIR}/.agents/bus"
[ -d "$BUS" ] || exit 0
# shellcheck source=/dev/null
. "$(dirname "${BASH_SOURCE[0]}")/lane-common.sh" || exit 0

# stdin is read whole and once — it is not seekable, and a later read gets
# nothing.
PAYLOAD="$(cat 2>/dev/null || true)"
read -r SESSION_ID LANE <<<"$(lane_resolve "$PAYLOAD")"

if [ -z "$LANE" ]; then
  [ -n "$SESSION_ID" ] || exit 0
  printf '%s\n' "<lane-bus lane=\"UNBOUND\">
This session is not bound to a lane, so the message bus is delivering nothing to
it. Messages may be waiting.

Five lanes exist. Four form a ring, each feeding the next:
  NEW3 (discovery) -> NEW2 (ingestion) -> LCC (enrichment) -> NEW1 (retrieval) -> NEW3
RCC (client) sits outside the ring and consumes what it produces.

Run the matching line ONCE — it binds this session id only:

  echo LCC  > .agents/bus/.lane-${SESSION_ID}     # server / enrichment
  echo RCC  > .agents/bus/.lane-${SESSION_ID}     # client
  echo NEW1 > .agents/bus/.lane-${SESSION_ID}     # retrieval, ranking, evidence
  echo NEW2 > .agents/bus/.lane-${SESSION_ID}     # ingestion, normalization
  echo NEW3 > .agents/bus/.lane-${SESSION_ID}     # discovery, acquisition

Then \`pnpm lane:inbox\` for the whole thread, \`pnpm lane:status\` for who is
behind. If you are none of these, ignore this — it will keep appearing and that
is harmless.
</lane-bus>"
  exit 0
fi

lane_collect "$LANE"
[ -n "${PENDING// /}" ] || exit 0

OUT="<lane-bus lane=\"${LANE}\">
$(lane_wrap)
Reply with: LAWMIND_LANE=${LANE} node scripts/lane-send.mjs <LANE> \"subject\" < body.md
</lane-bus>"

lane_commit "$LANE" "$HIGHEST"

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$OUT" \
    '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
else
  printf '%s\n' "$OUT"
fi

exit 0
