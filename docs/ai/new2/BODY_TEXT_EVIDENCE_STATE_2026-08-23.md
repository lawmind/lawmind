# BODY-TEXT EVIDENCE STATE — an unscreened document must not read as a clean one

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Coordinated with:** LCC (owns
`judgment_quality_contract` and the migration)

The founder's instruction: `body_text_safe`-style naming is dangerous because
*true* usually means **not proven damaged**, not **proven clean**. LCC's
operational rule does not change — known damaged text is still refused as
evidence. What changes is that a future agent must not be able to read
UNSCREENED as CLEAN.

---

## 1 · The defect is still live, and it is 90.4% of the corpus

`judgment_quality_contract.text_state` today:

```sql
CASE
  WHEN j.script_quality IS NULL                                    THEN 'TEXT_UNKNOWN'
  WHEN j.script_quality IN ('clean','mixed_script_ok')             THEN 'TEXT_UNKNOWN'
  ELSE                                                                  'TEXT_DAMAGED'
END
```

Two different facts arrive at one word. Counted 23 Aug over all 18,698,984 rows:

| `script_quality` | `script_quality_method` | rows | what it means |
| --- | --- | ---: | --- |
| `NULL` | `NULL` | **16,906,663** | **no verdict has ever been recorded** |
| `damaged_other` | `english_density_screen_v1` | 1,264,107 | a weak screen convicted it |
| `damaged_other` | `text-damage-v2.0` | 469,599 | proof-grade damage |
| `legacy_font_ascii` | `text_marker_screen_v1` | 58,615 | a marker screen convicted it |
| `clean` / `mixed_script_ok` | — | **0** | — |

**No writer has ever emitted a clean verdict.** The `clean` branch of that CASE
is unreachable, so 100% of `TEXT_UNKNOWN` is *never screened* — 16,906,663 rows,
**90.42%** of the corpus.

## 2 · And yet the screening DID happen — the evidence is in a file, not in a row

`services/ingest/.checkpoints/text-safety-screen-all.json`:

```json
{ "screened": 18698968, "candidates": 1712802, "written": 1712802,
  "byState": { "UNKNOWN": 16986166, "OCR_CANDIDATE": 1654187,
               "LEGACY_FONT_SUSPECT": 58615 } }
```

Every document was looked at. The screen writes **only when it convicts**, so
"this document was screened and this screen found nothing" survives in a JSON
checkpoint that nothing can join against. That is the whole gap: the fact
exists, the row cannot express it.

## 3 · The additive contract

### 3.1 The state

`body_text_evidence`, four values, on `judgment_quality_contract` — **additive,
nothing removed, `text_state` and `text_grade` keep their meaning and their
consumers**:

| value | meaning |
| --- | --- |
| `PROVEN_DAMAGED` | a proof-grade method convicted it (`text-damage-v2.0`) |
| `SCREENED_DAMAGED` | a weaker screen convicted it |
| `SCREENED_NO_DAMAGE_FOUND` | a named screen ran over this document and did not convict |
| `NEVER_SCREENED` | no screen has ever run over it |

The name is `SCREENED_NO_DAMAGE_FOUND`, not `SCREENED_CLEAN`, and the difference
is the point. Bus 0980 measured our English-density screen missing **32 of 43**
glyph dumps whose signature footer lifts the English rate. A screen that did not
convict has found no damage; it has not certified the text.

**Recovery stays a separate axis.** `recovery_state` already answers "has OCR
recovered this", and a recovered document is still `PROVEN_DAMAGED` in its
original text — the recovery sits beside `full_text`, never over it.

**Metadata discoverability stays separate too.** A judgment whose body text is
unreadable is still findable by citation, case number and title. Nothing in this
state may be read as "this judgment is unreachable".

### 3.2 The coverage table that makes `SCREENED_NO_DAMAGE_FOUND` populatable

```sql
CREATE TABLE quality_screen_runs (
  judgment_id  uuid        NOT NULL REFERENCES judgments(id) ON DELETE CASCADE,
  method       text        NOT NULL,          -- 'english_density_screen_v1', 'text-damage-v2.0'
  screened_at  timestamptz NOT NULL DEFAULT now(),
  convicted    boolean     NOT NULL,
  PRIMARY KEY (judgment_id, method)
);
CREATE INDEX quality_screen_runs_method_idx ON quality_screen_runs (method, convicted);
```

A row per (document, method) — so "screened by v2.0 but not by the marker
screen" is expressible, and re-running a method updates one row rather than
appending forever.

### 3.3 The view expression

```sql
CASE
  WHEN j.script_quality_method = 'text-damage-v2.0'  THEN 'PROVEN_DAMAGED'
  WHEN j.script_quality IS NOT NULL                  THEN 'SCREENED_DAMAGED'
  WHEN EXISTS (SELECT 1 FROM quality_screen_runs r
                WHERE r.judgment_id = j.id)          THEN 'SCREENED_NO_DAMAGE_FOUND'
  ELSE                                                    'NEVER_SCREENED'
END AS body_text_evidence
```

**Until `quality_screen_runs` is populated, every unconvicted row reads
`NEVER_SCREENED`.** That is the correct failure direction and it is why this
expression is safe to ship before the backfill: the contract can only become
*more* generous as evidence arrives, never less. A version that defaulted the
other way would silently certify 16.9M unexamined documents.

### 3.4 Consumer guidance, unchanged in substance

| a consumer asking | reads |
| --- | --- |
| may I quote this text as evidence? | `PROVEN_DAMAGED` and `SCREENED_DAMAGED` → **no**. Anything else → not refused, not certified. |
| may I embed / index this? | LCC's existing eligibility view. Unchanged. |
| is this judgment findable at all? | metadata, never this column |
| how strong is the damage verdict? | `text_grade` (`PROOF` / `SCREEN` / `NONE`), unchanged |

**Do not surface this in the UI by default.** The advocate's question is "can I
rely on this", answered by the citation states; our screening coverage is an
operational fact about us.

## 4 · What this lane will do the moment the table exists

`text-safety-screen-cli.ts` and `text-damage-persist-cli.ts` are this lane's
writers. Both already know, per document, whether they convicted — they simply
discard the negative. Emitting a `quality_screen_runs` row on both branches is a
small change in each, and the 18,698,968-row checkpoint means a backfill for
`english_density_screen_v1` needs no re-read of the corpus.

**Not done unilaterally**: the table and the view are LCC's, and
`body-text-safety.test.ts` deliberately pins the view expression against
`pg_get_viewdef`. That tripwire is working as designed; this is the coordination
it is meant to force.

## 5 · Reproduce

```
node --env-file=.env services/ingest/.n2b-p3-measure.mjs
```
Artifact: `docs/ai/new2/body-text-evidence-census.json`.
