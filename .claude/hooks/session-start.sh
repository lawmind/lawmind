#!/usr/bin/env bash
# SessionStart hook — fires once per session.

echo "<lawmind-session-start>"
echo "MANDATORY READ ORDER: PRODUCT_BRIEF.md -> .ai/README.md -> docs/OPEN_DECISIONS.md -> PRODUCT_DECISIONS.md -> docs/SCHEMA_TRUTH.md -> docs/CITATION_HARNESS.md"
echo ""
echo "PRODUCT_BRIEF.md is the north star. PD-1..PD-12 in PRODUCT_DECISIONS.md are SETTLED — never silently reopen."
echo ""
echo "OPEN DECISIONS (never resolve alone):"
grep -E '^## OD-' docs/OPEN_DECISIONS.md 2>/dev/null || echo "  (not at repo root)"
echo ""
echo "BLOCKING: OD-4 blocks S1 · OD-6 blocks upload features · OD-7 blocks scanned intake"
echo "Gate S2 (citation accuracy) is a HARD STOP. See BUILD_GUIDE.md"
echo "</lawmind-session-start>"
