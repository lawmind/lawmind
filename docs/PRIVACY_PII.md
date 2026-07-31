# PII AND PRIVACY PIPELINE

## The problem, stated honestly
There is no PII solution that guarantees complete erasure. Logs exist. Caches
exist. Embeddings exist. Any claim otherwise is marketing.

What we can do is reduce exposure, be precise about what leaves the machine, and
never overstate the guarantee to an advocate.

## Why this is sharper for us
Uploaded case documents contain names of accused persons, witnesses, complainants
and minors. **None of those people are our users. None consented to anything.**
Under DPDP that is third-party personal data, and a materially larger exposure
than our hosting-region gap (OD-2).

## Routing by data sensitivity, not task complexity

| Data class | Contents | Routing |
|---|---|---|
| **Public** | Judgment text, statutes — already published | Any provider. Cheapest wins. |
| **Sensitive** | Uploaded documents, matter notes, party names, client detail | Pseudonymise first. Provider must have written data-processing terms. |
| **Never sent** | Full client files with no legal reason to leave the device | Stays local. Process what is needed, not the whole file. |

**OD-6 records the provider decision.** DeepSeek's API terms are unclear on
retention and training use. Acceptable for public judgment search. Not acceptable
for a document naming a minor in a POCSO matter.

## Pseudonymisation — before any sensitive-class call

1. Detect entities: person names, addresses, phone numbers, PAN, Aadhaar, bank
   accounts, vehicle numbers, minors' identifiers.
2. Replace with stable tokens per document: `[ACCUSED_1]`, `[WITNESS_2]`,
   `[MINOR_1]`. Stable so the model reasons about relationships without holding
   identities.
3. Store the mapping locally in `pii_entities`, encrypted, never transmitted.
4. Re-identify on the way back, client-side.

Realistic coverage is around 80%. **That is not 100% and must never be described
as such**, to an advocate or in marketing. Remaining risk is disclosed plainly;
high-sensitivity matters get a manual review path.

Indian names, transliteration variants and Devanagari make NER materially harder
than English benchmarks suggest. Evaluate on real Indian court documents before
trusting any off-the-shelf model.

## Copied citations are recorded — and disclosed
Every "Copy citation" tap writes a `citation_copies` row: which judgment, when,
and the matter if there was one. It exists for one reason — when a judgment is
later overruled, that record is the **only** way to warn an advocate who took the
citation out of the app. Without it they see a verified badge, file the case, and
nothing can reach them.

It is their own activity about public judgments and holds no third-party personal
data, so it is not sensitive-class. It is still tracking, and we do not do silent
tracking: it is **named in the in-product privacy disclosure**, in the same plain
terms as everything else. Deleted on account deletion and through the DPDP erasure
path. `SCHEMA_TRUTH.md#citation_copies`.

## Retention
- Copied-citation records: deleted with the account or on erasure request.
- Pseudonymisation maps: local only, deleted with the matter.
- Prompt logs: store pseudonymised text, never the original.
- Embeddings of sensitive documents: same DPDP treatment as source text. An
  embedding is derived personal data, not anonymous.
- Deletion purges R2 objects, Postgres rows, embeddings and caches. A soft delete
  flag is not deletion.

## What we tell advocates
Plain language, in-product: what leaves the device, what is pseudonymised, what
we cannot guarantee. Never "fully private" or "completely anonymous". Advocates
are trained to distrust overclaims — an honest limitation builds more confidence
than a false absolute.
