# The four questions a judgment row answers, and why they are four

NEW2, 20 August 2026. Proposed to LCC as the canonical vocabulary; LCC owns the
final naming and the derivation rules that sit on top of it. Nothing here changes
a column. It names what the existing columns already mean, so that the next
selector cannot quietly collapse two of them.

---

## The collapse this exists to prevent

`DISMISSED`, `DISPOSED` and `CLOSED` are registry bookkeeping. They say what
happened to a *file*. They do not say what the *document* is, and they do not say
whether an advocate may cite it.

The Tier-A selector currently reaches substantive status through
`hc_document_class`, which is derived from `disposal_nature`, which is a registry
string. Three inferential steps, each of them lossy, presented to the retriever
as one boolean. That is how `decided_brief` — a class whose rule is literally
"the merits-looking disposal string, on a document too short to have merits" —
came to sit inside Tier A at **15.6%** precision.

So: four axes, measured separately, never one enum.

---

## 1. DOCUMENT ROLE — what kind of document is this?

A property of the text. Answerable by reading the document and nothing else.

| value | meaning |
| --- | --- |
| `judgment` | reasoned adjudication of a lis, whatever the outcome |
| `final_order` | disposes of the matter with little or no reasoning |
| `interim_order` | interlocutory relief, stay, direction pending hearing |
| `bail_order` | bail, anticipatory bail, cancellation |
| `procedural` | adjournment, listing, office objection, restoration, condonation |
| `registry_note` | non-judicial: defect memo, stage code, cause-list extract |
| `unknown` | nothing has read it, or a reader read it and could not say |

`unknown` is a value, not a null. `hc_document_class IS NULL` currently conflates
"a rule refused" with "nothing ever looked", and `hc_class_method` is the only
thing that separates them. Any successor column carries the method beside the
verdict for the same reason.

## 2. DISPOSITION — what happened to the case?

A property of the *proceeding*, taken from the registry, never inferred from the
text and never inferred backwards into role.

`allowed` · `dismissed` · `partly_allowed` · `withdrawn` · `disposed` ·
`abated` · `transferred` · `unknown`

**`dismissed` says nothing about role.** A dismissal after a full hearing on
merits is precedent; a dismissal for non-prosecution is not. Both write the same
registry string. This is the single most load-bearing sentence in this document,
and it is the one the current selector does not honour.

## 3. CITABILITY — may an advocate rely on this as authority?

Derived, never stored raw. It is a function of role, of text quality, and of
`overruled_status`; and it is a different question from all three.

| value | meaning |
| --- | --- |
| `citable_substantive` | reasoned, identifiable, text safe to quote |
| `citable_with_care` | usable but not precedent — most `bail_order`, most `final_order` |
| `not_citable` | procedural or registry material |
| `unsafe` | the text or the identity cannot be trusted, whatever the role |
| `unknown` | not assessed |

`unsafe` outranks role. A reasoned judgment whose Devanagari the extractor
deleted is `unsafe`, not `citable_substantive`, because what we hold is not what
the court wrote.

Citability is **not** cached across `overruled_status`. Verification is
permanent; good-law status is not. The overruled question is read live at render
on every surface, and this axis does not shortcut it.

## 4. TEXT QUALITY — is the text we hold what the court published?

A property of our extraction, independent of all three axes above. This is the
existing `script_quality` vocabulary, plus the discipline that governs writing to
it.

| value | may be written when |
| --- | --- |
| `KNOWN_GOOD` | a positive check fired — script retention verified against a second extraction, or a PDF font dictionary read clean |
| `KNOWN_DEFECT` | damage found and named |
| `LEGACY_FONT_SUSPECT` | text-marker screen fired: zero Devanagari plus mined ASCII markers |
| `OCR_CANDIDATE` | the text is not language — no Devanagari and fewer than 12 English function words per thousand characters |
| `NO_EXTRACTABLE_TEXT` | extraction returned nothing at all |
| `UNKNOWN` | anything else, including every row nothing has read |

Mapped onto the deployed column (`migration 0056`): `clean` and
`mixed_script_ok` are `KNOWN_GOOD`; `devanagari_deleted` and `damaged_other` are
`KNOWN_DEFECT`; `legacy_font_ascii` is `LEGACY_FONT_SUSPECT`; `NULL` is
`UNKNOWN`. No column change is being proposed — the naming above is for the
export and for the conversation, and the mapping is one function.

### The rule that makes this axis worth having

**Never write `KNOWN_GOOD` because a detector did not fire.**

Four extraction failure modes are live in this corpus and they are not
symmetrical:

1. missing or structurally broken text;
2. the alternate extractor deleting Devanagari outright — Poppler `pdftotext`
   returned **zero Devanagari tokens on 32 of 32** Devanagari-bearing judgments
   against `unpdf`'s 28,285;
3. legacy-font Hindi rendering as clean-looking ASCII (Kruti Dev and kin);
4. mixed documents whose English caption reads perfectly while the Hindi
   reasoning is damaged;
5. **subset-embedded fonts with no `/ToUnicode` map** — measured 20 Aug 2026 and
   not previously named. The extractor emits raw glyph codes and the output is a
   substitution cipher: `74< =7/ 12- <.50 7==-4;-<`. It reaches **56.3% of Punjab
   and Haryana's** and **48.8% of Karnataka's** admitted Tier-A documents and
   under 1.5% of every other court's. Confirmed from the PDFs themselves: 76.9%
   of the suspects declare fonts and not one Unicode map, against 10.3% of
   controls drawn from the same courts. **No re-extraction can fix these** — the
   mapping is absent from the file — so they are an OCR question, not an
   extractor question.

Modes 2, 3 and 5 all produce output that **every existing quality signal scores
as perfect**. `classifyCorruption` reads `[A-Za-z]` shapes and ten English probes,
so ASCII-only output scores CLEAN. "Never shorter" fails too: one sampled
document went from 2,252 characters with 8 Devanagari tokens to 2,314 characters
with none.

Mode 5 is worse than missed: `text_quality` **certifies** it. All 1,115
unreadable rows in the audit sample carry a score, the minimum is 0.857, the
median is 1.000, and every one passes the 0.85 floor `axis_b_text` gates on.
`textQuality()` tokenises on `/[A-Za-z]/`, so substitution garbage is dropped
from its own denominator and the metric ends up scoring the surviving
digital-signature footer.

Absence of evidence is `UNKNOWN`. It costs nothing — the eligibility contract
already passes `NULL` and excludes only a known-bad verdict. A wrong
`KNOWN_GOOD` costs the entire purpose of the column.

---

## How the four compose

```
DOCUMENT ROLE   read from the text        judgment | final_order | ... | unknown
DISPOSITION     read from the registry    allowed | dismissed | ... | unknown
TEXT QUALITY    read from our extraction  KNOWN_GOOD | ... | UNKNOWN
                                                │
CITABILITY  ────────────────────────────────────┘  derived at read time,
                                                   with overruled_status live
```

No arrow runs from DISPOSITION to CITABILITY. That absence is the point of the
document.