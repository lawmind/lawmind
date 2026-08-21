# The structured legal object — programme, scope, and what it refuses

**14 August 2026, LCC, per the founder's DEEPSEEK SCALE-UP directive.** This is
the record for the five enrichment tasks added by migration `0051`. Read
`docs/ai/DEEPSEEK_DATA_MOAT.md` first — it is the inspection this builds on, and
its §1 capacity finding is still binding.

---

## 1 · WHAT WAS ALREADY THERE, AND WAS NOT REBUILT

The directive asked to scale DeepSeek usage, rotate keys, cache inputs, record
every call, fall back to OpenRouter, and not duplicate a running worker. **All
of that already existed**, and the first hour of this session went on reading it
rather than writing a second copy:

| asked for | where it already lives |
| --- | --- |
| key rotation | `inferx.ts` `inferxKeysFromEnv` / `callInferxPooled` — `INFERX_API_KEY`…`_4`, rotates on 429/401/403, refuses to rotate on 400 |
| paid fallback | `openrouter.ts`, with a circuit breaker in `enrich-cli.ts` (3 consecutive capacity failures opens it, re-probes every 25 documents) |
| real cost, never estimated | OpenRouter's own `usage.cost`, written to `llm_calls.cost_usd` |
| the call ledger | `llm_calls`, one row per call, with `data_class` and `pseudonymised` |
| input caching | `document_enrichments` unique on (judgment_id, task, prompt_version, input_hash) |
| **failed calls must not become cache hits** | the cache lookup filters `status = 'ok'`. This is load-bearing: without it, 840 documents touched during the model-alias outage would have been permanently skipped |
| span verification | `enrich.ts` `verifyClaims` — whitespace-flattened, case-folded substring match against the source text. Not fuzzy. Not Levenshtein |
| re-verification with no tokens | `enrich-cli --reverify`, which is why `raw_output` is stored |

**Nothing in the above was changed.** What was added is five new tasks that use
it.

---

## 2 · THE FIVE TASKS

| task | recovers |
| --- | --- |
| `case_structure` | facts · issues · procedural history · chronology · relief sought |
| `holding` | holdings · reasoning · relief granted · propositions of law |
| `arguments` | each side's contentions, attributed, kept apart from the holding |
| `authorities` | the authorities and provisions the court **relied on**, and what for |
| `topics` | subject taxonomy · the queries an advocate would type to find this case |

### 2a · Every field is a QUOTE, and that is the whole safety argument

This is a summarisation task in every other product. Summarisation is the shape
this pipeline refuses, because `verifyClaims` can prove exactly one thing: that
a string appears in the document. A paraphrase never does — *"the appellant
challenged the conviction"* is nowhere in a judgment that says *"the appellant
assails the judgment of conviction dated 12.03.2019"*.

So a paraphrase could only be verified by weakening the check. `enrich.ts`'s
`LABEL_KINDS` comment already says why that door stays shut: *"Do NOT add a kind
here to make a failing verification pass."*

**The model is therefore asked to QUOTE, and the quote is the claim value.** Each
item is `{quote, label}`:

- `quote` → becomes both `Claim.value` and `Claim.evidence`, so it takes the
  **full-strength check a citation gets**, not the weakened label path used for
  `treatment` and `document_class`;
- `label` → the model's own gloss, carried in `extra`, **never verified, never
  promoted, never displayed as fact**.

A fabricated passage fails. A summarised one fails. A real passage lifted from a
different judgment fails. `enrich.test.ts` asserts each of those individually,
plus one test that asserts none of the five new kinds has been quietly added to
`LABEL_KINDS`.

**The cost is recall, and it is the right cost:** a holding the model cannot find
words for is dropped rather than written from memory.

### 2b · What the model is NOT paid to do

`authorities` deliberately does not extract citations or section numbers.
`citations.ts` and `sections.ts` do that deterministically and better, and the
directive is explicit: *"Use deterministic extraction instead of DeepSeek
whenever deterministic extraction is sufficient."* What no regex can decide is
whether an authority was **load-bearing or merely listed**, and what proposition
it was invoked for. That judgement is the only thing asked for.

---

## 3 · THE ELIGIBLE POPULATION — and a measurement that reversed the design

`RING_PROGRAM.md` §2b: *"state what a workload will NOT cover, before starting
it."*

**NOT covered:** bail orders, procedural disposals, reference stubs, anything
under 2,000 characters, and anything already carrying a `status = 'ok'` row for
the same task and prompt version.

### The finding that changed the queue

Every other pass in `enrich-cli.ts` sorts `created_at DESC` so it follows the
ingest. **Measured 14 Aug 2026: of the newest 200,000 judgments, 199,444 —
99.7% — have `hc_document_class` NULL.** The rule-based classifier is far behind
the harvest.

So at the ingest head there is nothing to prioritise *with*. "Substantive first"
ranks 184 documents out of 200,000, and the exclusion filter removes 304. A
newest-first legal-object pass would spend almost its whole budget on
unclassified documents that are, by the corpus-wide ratio, mostly bail orders —
**precisely the drift §2b names, reached by following a sensible rule off a
cliff.**

**The eligible population is therefore the CLASSIFIED SUBSTANTIVE one:**

    decided        194,610
    decided_brief   39,046
    ------------------------
    eligible       233,656   (measured 14 Aug 2026, before NEW2's +773,096 pass)

Served by the existing partial index `judgments_hc_document_class_idx`. It is
bounded, it is where structure actually exists, and **it grows as
`hc-classify-cli` catches up** — the correct dependency, since a document nobody
has classified is a document nobody has established is worth reading.

### Two performance facts, both learned by the query failing

1. **`length(full_text)` detoasts the column for every row it touches.** In the
   `WHERE` over the eligible population that is hundreds of thousands of
   decompressions to return 100 ids, and it is why the first version of this
   query **returned nothing in ten minutes**. It now runs against the bounded
   pool instead.
2. **Priorities 4 and 5 (citation-rich, statute-heavy) are counts over other
   tables.** In an `ORDER BY` over the whole population Postgres computes them
   for every candidate before it can sort. They now rank inside a `LIMIT * 20`
   pool, so the counts are paid for on thousands of rows rather than millions.

### Priority 1 currently selects nothing, and that is recorded rather than hidden

`text_extraction_method = 'pdftotext_fallback'` on **0** rows; `unpdf` on
4,504,033; NULL on 333,788. The repair pass has not written a row. The tier
stays, with the value checked against migration `0048` — an earlier draft of the
query invented `'repaired'`, a priority that would have silently ranked nothing
for a reason nobody could see.

---

## 4 · THE EXCERPT WINDOW, AND THE RECALL IT KNOWINGLY GIVES UP

`HEAD_CHARS = 4_000` is right for metadata and catastrophically wrong for
`holding` — the operative direction is the **last** thing in a judgment.

Measured over 20,000 substantive documents: **p50 4,977 chars · p90 22,146 ·
p99 125,929.** A 28,000-character budget therefore sends **more than 90% of
substantive judgments whole**, and the 20k-head + 8k-tail split only ever
applies to the long tail.

**What is given up, stated plainly: on a document past the budget the middle is
not shown, so reasoning living only there cannot be found.** That is a recall
loss and it is **invisible** — a claim never made leaves no trace, and no
verification catches it. It is accepted because the alternatives are paying for
125,929 characters on the 1%, or letting the model write a holding it was never
shown. The second is not a trade this pipeline makes.

The elision is safe by construction: `verifyClaims` runs against the **full**
source text, so a quote from either side still verifies, and the model cannot
quote what it was never sent.

---

## 5 · THE THROUGHPUT CEILING IS NOT CODE

`DEEPSEEK_DATA_MOAT.md` §1 measured it and it still holds: **running several
callers at once against the free InferX pool makes the 429 rate measurably
worse.** So `enrich-cli` stays at one caller, and this programme does not
"scale up" by adding concurrency to a pool that punishes it.

Measured this session: **~16 s/document, one grant configured.** That is roughly
225 documents/hour against an eligible population of 233,656 **per task**, five
tasks — about 5,200 hours single-threaded.

**The lever is grants, not threads**, and it is a founder item, filed in
`FOUNDER_QUEUE.md`. `inferxKeysFromEnv` already reads `INFERX_API_KEY_2/_3/_4`
with no code change; the run log reports `InferX grants 1`.

---

## 6 · THE DATASETS

`services/ingest/src/dataset-export-cli.ts` — JSONL, not tables, because *"a
table in the same database is not separate in the way that matters: the next
agent writes a join, the join works, and a training artefact has silently become
something the product reads."*

| set | shape | provenance |
| --- | --- | --- |
| `case_intelligence` | document → issues · facts · holding · reasoning · span | model, span-verified |
| `treatment` | case A → treatment → case B → evidence | deterministic (`detectTreatment`) |
| `citation` | citation → canonical authority | deterministic (`buildIndex`) |
| `retrieval` | query → authority → passage | span verified, **query is the model's proposal and is named so in the field** |
| `statute` | provision → amendment → effective date | deterministic, official source |

Rules the exporter enforces mechanically rather than by promise:

- **Only claims whose span was located.** A `partial` enrichment contributes its
  verified claims and drops its rejected ones; a `rejected` one contributes
  nothing. `CLAUDE.md` forbids training on a model's commentary about law — this
  is the enforcement, not a reminder.
- **The split is by DOCUMENT hash, not by row.** One judgment yields many
  claims; splitting rows at random puts a case's facts in train and its holding
  in eval, and the evaluation then measures memorisation.
- **An empty set is reported, never quietly absent.** An empty file and a missing
  file look identical to whoever trains next.

---

## 7 · WHAT THIS PROGRAMME DOES NOT DO

- **Nothing here is read by the product.** `0045`'s boundary is untouched: no
  route joins `document_enrichments`, no retrieval path consults it, and
  promotion into a canonical table is a separate, measured step **not built
  here**.
- **No embeddings.** Phase 2 begins after the data gate, not before.
- **No Case Brain, no hearing intelligence, no premium workflow.**
- **The rejected citation-adjudication-as-canonical-identity approach stays
  rejected.** `CITATION_CONCORDANCE_EVALUATION.md` measured 10.8% fabrication
  when the answer was absent, and that measurement is why this table exists at
  all.
