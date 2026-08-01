#!/usr/bin/env bash
# UserPromptSubmit hook — re-injects the non-negotiable core on EVERY turn.
# The only mechanism that survives context compaction. Keep it SHORT.

cat <<'CORE'
<lawmind-core>
PRIME (global CLAUDE.md): DONE/VERIFY before work · INTENT before any behavior
change · KNOW/INFER/GUESS, never silent guessing · 3 failed cycles = STOP ·
done = OBSERVED not inferred.

LAWMIND NON-NEGOTIABLE:
- Citations: THREE fields, not one enum. verification_state (verified|unverified|
  failed) · verified_by_source (corpus|public_x2|ecourts|none) · overruled_status
  (none|set_aside|partly_set_aside|doubted, on judgments). A judgment can be
  verified AND overruled. What renders is DERIVED at render time, never stored.
  Render FROM THE DB ROW. Never show unverified as confirmed. NEVER silently
  drop one. set_aside disables add-to-matter. docs/CITATION_HARNESS.md
- overruled_status is NEVER cached. Verification is permanent; good-law status is
  not. Read it live at render on EVERY surface. Stale-overruled rate threshold 0 —
  overruled law rendered WITHOUT the LAW MOVED mark is as severe as a hallucination.
- UI: VERIFIED IS SILENT. No badge on a verified citation. Only two states render:
  unverified (unmissable mark + eCourts path) and overruled (LAW MOVED, 3 states).
  Silence = "verified, not decorated". Silence NEVER = "dropped". Detail on tap,
  summary in the draft footer. Data model and pipeline UNCHANGED.
- No AI-assisted mark on documents. Consent once at onboarding, recorded in users
  (terms_accepted_at, terms_version). PD-8 superseded. No watermark on export.
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
