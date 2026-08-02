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
| **Public** | Judgment text, statutes, bare acts — already published | **DeepSeek V4 Flash.** No privacy question; this text is public record |
| **Sensitive** | Uploaded documents, matter notes, party names, client detail | **Pseudonymise first, then Claude** — Anthropic has written data-processing terms |
| **Never sent** | Full client files with no legal reason to leave the device | **Stays local.** Process what is needed, not the whole file |

**OD-6 resolved 2 Aug 2026.** DeepSeek's API terms are unclear on retention and
training use: acceptable for public judgment search, **not acceptable for a
document naming a minor in a POCSO matter.** That asymmetry is the whole reason
routing keys off data class rather than task difficulty.

**Ambiguity resolves to sensitive, never to public.** There is no fallback from a
sensitive-class call to a cheaper provider — an outage means the feature is
unavailable, not that the document goes somewhere else.

**Still required, and not satisfied by the routing decision:** a **countersigned
DPA** with zero-retention and no-training-on-inputs terms, plus a reviewed
sub-processor list, on an endpoint whose region is defensible under OD-2. The
admin surface refuses to route sensitive traffic to a provider with no DPA on
file, with no founder override. **Until the signature exists, that set is empty.**

## One document per call — hard rule

**Never put more than one case document in a single prompt.**

Multiple case files in one context creates **cross-contamination**: the model
conflates parties between matters, and attributes a fact from one client's file to
another's. That failure is invisible in the output — it reads as a fluent,
confident answer about the wrong person — and it is a confidentiality breach
between two of the same advocate's clients, which is professionally far worse than
a wrong answer.

This constrains batching. **Do not batch documents to save tokens.** If a feature
needs to reason across two documents, that is a design question to answer
deliberately, not something to let a prompt-builder do by accident.

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

**Presidio (Microsoft, MIT) is the detection base, not the answer.** It supplies
the framework, the recognisers and a re-identification story. It does not supply
accuracy on our documents.

Indian names, transliteration variants and Devanagari make NER materially harder
than English benchmarks suggest. **Evaluate Presidio on real Indian court
documents before trusting it** — a published F1 measured on English news text is
not evidence about a Hindi bail order naming four transliterated surnames. Until
that evaluation exists, the ~80% figure above is an estimate, not a measurement,
and should be described that way internally too.

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

## What we tell advocates — and where

Plain language: what leaves the device, what is pseudonymised, what we cannot
guarantee. Never "fully private" or "completely anonymous". Advocates are trained
to distrust overclaims — an honest limitation builds more confidence than a false
absolute.

**Where it appears — revised 1 Aug 2026.** The privacy disclosure lives in
**onboarding** and on a **settings page**. It does **not** appear during use.

This is the same principle as the silent-verified UI: state it once, plainly,
where the advocate is deciding whether to trust the product — then get out of the
way. A disclosure that reappears mid-task is not more honest, it is just noise,
and noise is what gets dismissed without reading.

**Nothing about the substance is softened.** Coverage is still ~80% and still
described as partial. The consent taken at onboarding (PD-8) covers AI assistance,
the duty to verify before filing, and the terms of legal use, and is recorded with
a timestamp and terms version.

**OCR field confirmation stays**, because it is a data-correctness step and not a
warning — but it is presented as a **normal review**, not a caution. The advocate
is checking extracted fields the way they would check a typed form, and the
cautionary framing was doing nothing except making a routine step feel risky.
