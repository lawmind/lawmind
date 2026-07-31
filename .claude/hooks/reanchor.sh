#!/usr/bin/env bash
# UserPromptSubmit hook — re-injects the non-negotiable core on EVERY turn.
# The only mechanism that survives context compaction. Keep it SHORT.

cat <<'CORE'
<lawmind-core>
PRIME (global CLAUDE.md): DONE/VERIFY before work · INTENT before any behavior
change · KNOW/INFER/GUESS, never silent guessing · 3 failed cycles = STOP ·
done = OBSERVED not inferred.

LAWMIND NON-NEGOTIABLE:
- Citations: 5 states (verified_internal/external/human, unverified, overruled).
  Render FROM THE DB ROW. Never show unverified as confirmed. NEVER silently
  drop one. docs/CITATION_HARNESS.md
- Never bypass the eCourts CAPTCHA. Human confirms, cache forever.
- Route by DATA SENSITIVITY not task difficulty. Uploaded docs = sensitive:
  pseudonymise first. OD-6 blocks upload features. docs/PRIVACY_PII.md
- Never claim complete PII removal. Coverage is partial. Say so.
- OCR output is never trusted silently — advocate confirms fields before save.
- Never train on a model's commentary about law. Primary sources only.
- BNS/BNSS/BSA replaced IPC/CrPC/Evidence July 2024. DOMAIN_TRUTH.md or the
  fact does not exist.
- Hindi = Noto Sans Devanagari everywhere incl. PDF export.
- Stack fixed: Expo · Hono · Railway PG + pgvector · Drizzle · better-auth.
  NOT Neon/Vercel/Qdrant/Clerk/Supabase. Ask before adding any vendor.
- Never resolve an OPEN_DECISION alone. docs/OPEN_DECISIONS.md
- Write only inside your lane (LCC/RCC/CX1/CX2). BUILD_GUIDE.md

If context was compacted: re-read docs/OPEN_DECISIONS.md, docs/SCHEMA_TRUTH.md,
docs/CITATION_HARNESS.md before your next edit.
</lawmind-core>
CORE
