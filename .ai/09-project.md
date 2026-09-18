# Lawmind — Project Module

Binds over 00–08 on conflict. Root `CLAUDE.md` binds over this.

## Domain files are authority, not suggestion
- `DOMAIN_TRUTH.md` — Indian legal facts. Never state a legal fact not in it.
- `docs/SCHEMA_TRUTH.md` — data shapes. Never infer a column.
- `docs/CURRENT_STATE.md` — live pointer: current gate, current capability
  registry, active agents, stops. Read first. Roadmap: `docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md`.
- `docs/API_CONTRACTS.md` — endpoint shapes. Changes go through
  `docs/product/CONTRACT_CHANGE_CONTROL.md` §7 (SHIP-owned CCR).
- `docs/CITATION_HARNESS.md` — verification spec. Binding.
- `docs/PRIVACY_PII.md` — sensitive-data handling. Binding.
- `docs/OCR_PIPELINE.md` — scanned intake.
- `docs/DATASETS.md` — what may and may not be trained on.
- `docs/OPEN_DECISIONS.md` — unsettled. Never silently resolve one.

## Agents — roadmap v7.4 §2 (the LCC/RCC two-lane split is history)
**SHIP — active:** product, `apps/mobile`, `services/api`, `services/cron`, ops,
release, capability registry, contract change control.
**DATA — continuous:** ingest, source/provenance, legal truth, embeddings,
retrieval evaluation.
**RED — frozen unless invoked:** independent audit; never implements.
Legacy LCC/RCC/NEW1/NEW2/NEW3/FIFTH records are immutable provenance.

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
