# Lawmind — Project Module

Binds over 00–08 on conflict. Root `CLAUDE.md` binds over this.

## Domain files are authority, not suggestion
- `DOMAIN_TRUTH.md` — Indian legal facts. Never state a legal fact not in it.
- `docs/SCHEMA_TRUTH.md` — data shapes. Never infer a column.
- `docs/API_CONTRACTS.md` — endpoint shapes. RCC builds against this with mocks
  and does not wait on LCC. **Frozen per sprint.**
- `docs/CITATION_HARNESS.md` — verification spec. Binding.
- `docs/PRIVACY_PII.md` — sensitive-data handling. Binding.
- `docs/OCR_PIPELINE.md` — scanned intake.
- `docs/DATASETS.md` — what may and may not be trained on.
- `docs/OPEN_DECISIONS.md` — unsettled. Never silently resolve one.

## Lanes — two
**LCC — Server:** db, migrations, API, ingest, retrieval, verification, cron, OCR
service, admin endpoints.
**RCC — Client:** Expo app, admin web, auth integration, client-boundary PII.
Write only inside your lane.

## Never
- Show an unverified citation as confirmed, or silently drop one.
- Render citation fields from model output instead of the database row.
- Cite an overruled judgment without showing it is overruled.
- Bypass the eCourts CAPTCHA.
- Send unpseudonymised document content to any model.
- Claim complete PII removal.
- Trust OCR output without advocate confirmation.
- Train on a model's commentary about law.
- Emit Hindi in a font without Devanagari coverage.
- Add Neon, Vercel, Qdrant, Clerk or Supabase.
- Resolve an OPEN_DECISION alone.
