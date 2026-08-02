#!/usr/bin/env bash
# SessionStart hook — fires once per session.
#
# Emits `additionalContext` so the orientation lands as a system reminder rather
# than a visible transcript entry.
#
# ALWAYS EXITS 0. A session that cannot start because its orientation hook failed
# is worse than a session with no orientation.
#
# The open decisions are READ FROM THE FILE rather than restated here, so this
# hook cannot drift from `docs/OPEN_DECISIONS.md`. It reads through
# $CLAUDE_PROJECT_DIR rather than a relative path: hooks run in the current
# directory, which is not guaranteed to be the project root — and ~/Documents is
# itself a git repo with this one nested inside it.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Only the headings ABOVE the `# RESOLVED` marker. Most ODs closed on 2 Aug 2026
# and still have `## OD-n` headings under that marker; listing those under
# "OPEN DECISIONS" would invite someone to re-litigate a settled decision, which
# is the exact failure this block exists to prevent.
OPEN_DECISIONS="$(awk '/^# RESOLVED/{exit} /^## OD-/{print}' "$ROOT/docs/OPEN_DECISIONS.md" 2>/dev/null)"
if [ -z "$OPEN_DECISIONS" ]; then
  # Distinguish "none are open" from "could not read the file". An empty list
  # rendered as silence would read as "nothing is unsettled" in both cases, and
  # only one of them is good news.
  if [ -r "$ROOT/docs/OPEN_DECISIONS.md" ]; then
    OPEN_DECISIONS="  (none open — every decision is recorded under RESOLVED)"
  else
    OPEN_DECISIONS="  (could not read $ROOT/docs/OPEN_DECISIONS.md — open it before any work)"
  fi
fi

IFS='' read -r -d '' TEMPLATE <<'TEMPLATE_TEXT'
<lawmind-session-start>
MANDATORY READ ORDER: PRODUCT_BRIEF.md -> .ai/README.md -> docs/OPEN_DECISIONS.md -> PRODUCT_DECISIONS.md -> docs/SCHEMA_TRUTH.md -> docs/CITATION_HARNESS.md

PRODUCT_BRIEF.md is the north star. PD-1..PD-12 in PRODUCT_DECISIONS.md are SETTLED — never silently reopen.

OPEN DECISIONS (never resolve alone):
__OPEN_DECISIONS__

BLOCKING: nothing blocks S0 or S1. Eight ODs closed 2 Aug 2026.
          OD-1 (court vendor) is open — trial pending, does NOT block S3: the
          adapter ships with the manual path working. OD-10 (alt billing)
          deferred to 1,000 paying users.
          Still owed, not sprint blockers: the countersigned DPA for
          sensitive-class routing, and counsel's written residency view.
Gate S2 (citation accuracy) is a HARD STOP. See BUILD_GUIDE.md
TWO LANES: LCC=server, RCC=client. Contract frozen per sprint. sprints/SPRINT_N.md
</lawmind-session-start>
TEMPLATE_TEXT

CONTEXT="${TEMPLATE/__OPEN_DECISIONS__/$OPEN_DECISIONS}"

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CONTEXT" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'
else
  printf '%s\n' "$CONTEXT"
fi

exit 0
