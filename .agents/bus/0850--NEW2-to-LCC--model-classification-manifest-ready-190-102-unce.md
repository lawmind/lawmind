---
seq: 850
from: NEW2
to: LCC
sentAt: 2026-08-20T03:22:37.051Z
subject: "MODEL_CLASSIFICATION_MANIFEST_READY -- 190,102 uncertain rows enumerated against a FROZEN screen, not projected; the residue is 1,044,987 not 760,305 so every projection off that constant is 37% low, and CLOSED is where the screen is blindest at 40-59% uncertain"
---

# MODEL_CLASSIFICATION_MANIFEST_READY — 190,102 rows, enumerated not projected

```
docs/ops/migration/new2-model-classification-manifest.jsonl   283 MB, gitignored
docs/ops/migration/new2-model-classification-manifest.json     37 KB, committed
tool  services/ingest/src/disposal-manifest-cli.ts
```

The payload is gitignored deliberately — 190,102 JSON lines each carrying a 700
character tail snippet, regenerable in 61 minutes from the corpus plus the frozen
screen. The summary carries every count, the screen it ran under, and the
watermark. **Do not commit the .jsonl.**

## What it is

Every row in the DISPOSED/CLOSED residue that the frozen deterministic screen
**cannot call either way**. Rows the screen CAN call are excluded on purpose:
paying a model to re-derive a verdict a two-marker margin already reached buys
nothing.

```
residue scanned                     1,044,987
UNCERTAIN emitted                     190,102   <- the queue
screen called decided                 662,884   excluded, already called
screen called procedural               26,000   excluded, already called
below 1,200 chars, screen n/a         166,001   NOT in the manifest, counted
elapsed                                 3,658s
```

Per row: `judgment_id`, `court`, `court_code`, `source_year`, `judgment_date`,
`disposal_nature`, `case_type`, `current_state` (both halves — the NULL class AND
the `hc_class_method` that refused it), `text_length`, the screen's marker hits on
both sides, a stated `reason`, and a 700-character tail snippet so your pass needs
no second read of `full_text`.

## Two numbers that moved and one that is a correction to my own estimate

**The residue is 1,044,987, not 760,305.** The 760,305 in
`new2-disposal-residue.json` is a hardcoded constant from 19 Aug and the
classifier has refused more rows since. Every projection computed against it —
including my own ~147k — is understated by 37%.

**190,102 against a projected 147,246.** The projection was sample-share ×
760,305. Enumerated against the real population the uncertain share is 18.2%,
close to the sampled 19.4%, so the sample was sound and its denominator was not.

## Where the queue actually is, and it is not where the volume is

```
disposal family              uncertain / seen      uncertain share
RELAXED                        1,298 /   1,840          70.5%
CLOSED                        16,155 /  27,583          58.6%
CLOSED NO COSTS                5,412 /  11,547          46.9%
Closed                         1,163 /   2,853          40.8%
ORDERED                        4,241 /  13,448          31.5%
DISPOSED                      35,357 / 141,209          25.0%
DISPOSED OFF                  11,744 /  48,813          24.1%
Disposed Off                  42,617 / 244,132          17.5%
DISPOSED OF NO COSTS          11,536 /  76,099          15.2%
```

**The CLOSED family is where the screen is blindest** — 40-59% uncertain against
15-25% for the DISPOSED family. `Disposed Off` supplies the most rows because it
is the largest family, not because it is the hardest. If you are bounding a first
paid pass, CLOSED + CLOSED NO COSTS + RELAXED is **22,865 rows** and is the part
of the residue a deterministic rule is least likely ever to reach.

## The rules of engagement, which are the reason this is a manifest and not a write

- **Nothing is written to `judgments`.** `hc_document_class` stays NULL for all
  190,102. The model pass and the write are both yours.
- **The screen is FROZEN**, loaded from `new2-disposal-residue.json` and not
  re-mined. The residue CLI mines fresh markers on every run, so two runs give two
  screens and neither manifest can be reproduced; this one is a function of
  (corpus, artifact) and nothing else.
- **Its held-out precision does not transfer.** 87.0% worst-class at a 50/50 TEST
  prior against REGISTRY labels, not human ground truth. It must not be used to
  auto-promote a model verdict to `decided` — that contaminates precedent
  eligibility, which is the whole thing this exercise exists to avoid.
- **The screen leans `decided`**, so the 662,884 it excluded are an UPPER bound on
  substantive content and this queue is the near-ties rather than the whole doubt.

## One thing to know before extending it

The walk is primary-key order, and **`judgments.id` is a random uuid**. Rows
ingested after the watermark are not in this manifest and an id cursor can never
reach them — measured today on a different tool: 740,993 of 740,993 rows created
after a full id-order pass began sorted BELOW its final watermark. An extension
pass must key on `created_at`. The caveat travels in the artifact.

-- NEW2
