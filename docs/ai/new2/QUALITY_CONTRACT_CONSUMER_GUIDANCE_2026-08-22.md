# The quality contract — what each field actually means, and the one that reads as more than it is

**NEW2 · 22 August 2026 · P9.** One queryable contract, so LCC, NEW1 and NEW3
stop rebuilding quality logic. This is the guidance to read before writing any
predicate against `judgment_quality_contract`.

---

## 1. The measurement that prompted this

```
judgments                                        18,698,968
script_quality IS NOT NULL  (convicted damaged)   1,792,321   9.58%
script_quality IS NULL                           16,906,647  90.42%
script_quality = 'clean' or 'mixed_script_ok'             0    0.00%
of the convicted, PROOF grade (text-damage-v2.0)    469,599
```

*Measured 22 Aug 2026 **after** the text-damage persist finished its full
1,626,762-row export in this session. Earlier in the same session, before that
job resumed, the same query read 1,741,056 / 16,957,912 / 90.68% — the figures
quoted in bus messages 1022–1024. The conclusion is unchanged; the 0.26pp shift
is recorded here rather than quietly overwritten, because a number that moved
while other lanes were reading it is exactly the kind that gets built on.*

Every value ever written is a conviction:

```
damaged_other       1,264,107   english_density_screen_v1
damaged_other         418,334   text-damage-v2.0
legacy_font_ascii      58,615   text_marker_screen_v1
```

`script-quality-cli.ts` writes `legacy_font_ascii` and nothing else.
`text-damage-persist-cli.ts` writes `damaged_other` and nothing else. **No writer
in the repository has ever emitted `clean` or `mixed_script_ok`**, so the
`IN ('clean','mixed_script_ok')` branch of the view is unreachable, and the
affirmative-clean state it implies does not exist in this corpus.

## 2. The consequence, stated precisely

`judgment_quality_contract` answers the same question twice and gives two
different answers for the same row:

```sql
text_state      = CASE WHEN script_quality IS NULL THEN 'TEXT_UNKNOWN' ... END
body_text_safe  =      (script_quality IS NULL OR script_quality IN ('clean','mixed_script_ok'))
```

For 16,957,912 rows `text_state` says **TEXT_UNKNOWN** and `body_text_safe` says
**true**. The view's own header is on the side of `text_state` — *"no detector hit
= UNKNOWN, never CLEAN"*, *"TEXT_UNKNOWN therefore covers 91% of the corpus and
says so"*. The boolean is the field that drifted from that, and the boolean is the
one consumers filter on (`services/api/src/search/body-text-safety.ts`,
`retrieve.ts`, `qlang/compile.ts`, NEW1's quarantine).

**This is not a claim that the filter is doing the wrong thing.** Excluding the
convicted is the only thing available today and it is the right thing. It is a
claim about what the name promises: `body_text_safe = true` means
**NOT PROVEN DAMAGED**, and 90.68% of the time it rests on no evidence at all.

## 3. Binding guidance for consumers — use these, in this order

| you want to know | read | never read |
|---|---|---|
| may I put this body text through semantic retrieval or a model? | `body_text_safe` | — |
| **how much do I know about this text?** | `text_state` + `text_grade` | `body_text_safe` |
| can the advocate still FIND this document? | `metadata_discoverable` | `body_text_safe` |
| may I show a date, or order by it? | `date_state` | `judgment_date` alone |
| may I use digits recovered by OCR? | `digit_trust` | `recovery_state` alone |
| may I present this as substantive authority? | `citability` (only `NOT_CITABLE` and `BAIL_ORDER` are asserted) | `role_class = 'decided'` |

Four rules that follow from that table:

1. **`body_text_safe = true` may never be rendered to an advocate as a quality
   statement.** It is an eligibility flag for our own pipelines. Anything the
   advocate sees about text quality comes from `text_state`, whose honest value
   for nine documents in ten is *we have not looked*.
2. **`text_grade` is the strength of the evidence, not a synonym for the state.**
   `PROOF` = the byte stream itself was examined (`text-damage-v2.0`);
   `SCREEN` = a cheaper density or marker test convicted it; `NONE` = nothing fired.
   A `TEXT_DAMAGED / SCREEN` row is weaker evidence than a `TEXT_DAMAGED / PROOF`
   row and the two must not be pooled into one damage rate.
3. **`metadata_discoverable` is independent of `body_text_safe` and stays that
   way.** A judgment whose body failed to extract must still be findable by
   citation, party name or case number. Semantic retrieval over its body refuses;
   the document does not vanish. That split is a product requirement, not an
   implementation detail.
4. **`role_class = 'decided'` is not citable.** NEW2 measured that class 30%
   procedural [13.6, 46.4] on a stratified frame read from primary documents.
   `citability` asserts only refusals. Nothing in this contract ever says
   *"yes, cite this"*.

## 4. The additive change NEW2 proposes — and has NOT made

Not made unilaterally, because `services/api/src/search/body-text-safety.test.ts`
pins the exact text of the `body_text_safe` expression against
`pg_get_viewdef`, deliberately, so that a change here has to be coordinated. That
tripwire worked; this is the coordination.

**(a) Add a column, do not change the boolean.**

```sql
body_text_evidence text  -- 'PROVEN_DAMAGED' | 'SCREENED_NO_DAMAGE_FOUND' | 'NEVER_SCREENED'
```

`body_text_safe` keeps its current expression and its current meaning, so no
consumer predicate moves and LCC's test stays green. The new column carries the
distinction that the boolean cannot.

**(b) Make the middle value populatable, which it is not today.**

The text-safety screen has already looked at all 18,698,968 rows — its checkpoint
records `screened: 18698968`, `candidates: 1712802`, and a cursor at the end of
the keyspace. It found nothing wrong with 16,986,166 of them and **wrote nothing
for any of them**, so its negative result exists only in a JSON file on disk.
A small coverage table fixes that without a single row of `judgments` being
touched:

```sql
CREATE TABLE quality_screen_runs (
  screen        text NOT NULL,     -- 'text-safety-screen'
  version       text NOT NULL,     -- the detector version, because a later
  scope         text NOT NULL,     --   detector's coverage is different evidence
  started_at    timestamptz NOT NULL,
  completed_at  timestamptz,       -- NULL while running: partial coverage is not coverage
  rows_screened bigint NOT NULL,
  cursor_end    text,
  PRIMARY KEY (screen, version, scope)
);
```

`SCREENED_NO_DAMAGE_FOUND` then means *this screen, at this version, looked at
this row and did not convict it* — which is weaker than clean and far stronger
than silence, and is honest about which of the two it is.

**(c) Name it for what it proves.** `SCREENED_NO_DAMAGE_FOUND`, never
`SCREENED_CLEAN`. The screens detect glyph dumps, legacy-font ASCII and low
English density. A faithful-extraction check does not exist in this corpus and
nothing should imply one does.

## 5. What this does not change

- The filter behaviour of every existing consumer: unchanged.
- `text_state`: already correct, already conservative, already says UNKNOWN.
- `citability`: already refuses to assert. Leave it refusing.
- The three-field citation model, which is separate from all of this and is not
  touched by anything here.
