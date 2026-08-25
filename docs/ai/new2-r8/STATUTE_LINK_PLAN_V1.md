# STATUTE_LINK_PLAN_V1 — R8.1 §7.2

**Lane:** NEW2 · **25 August 2026** · state **`PREPARED_NOT_EXECUTED`**
**Gate:** the apply is ~320k row updates. That is HEAVY_BOX work and NEW1 holds
the lease. The script refuses `--apply` without `--i-hold-heavy-box`.

**Artifacts**
- `scripts/n2-statute-link-plan.mts` — classifier, DRY RUN, writes nothing
- `scripts/n2-statute-link-apply.mts` — the write, separate file, defaults to dry run
- `docs/ai/new2-r8/statute-link-plan.json` — full classification
- `docs/ai/new2-r8/statute-link-set.json` — the 1,065 pairs that may be written

---

## 1. Where this stands today

```
judgment_statute_refs        862,594 rows
  statute_id NOT NULL              0        <- the gap
statutes                         846
statute_sections              35,395
distinct act_key values       10,483
distinct (act_key, act_named)  16,582
```

Every statute reference in the corpus is unlinked. An advocate reading a
judgment that cites s. 138 of the Negotiable Instruments Act cannot be shown
s. 138, although all of that Act's sections are held.

---

## 2. One canonical Act-key implementation, and it already existed

`canonicalAct` from `@lawmind/ingest/sections` — the same function the ingest
used to **write** `judgment_statute_refs.act_key`, and the same one `/search`
uses to **read** it (`retrieve.ts:1234`, `qlang/compile.ts:289`). This plan
imports it. A second normaliser here would have been a second truth, and §7.2
asks for one.

No model is called anywhere in this plan. Every decision is a set-size or a
string-equality question.

---

## 3. The correction that changed the method: classify PAIRS, not keys

A key-level classification says: *does this `act_key` match exactly one held
Act?* Run that way it reports **322,957 linkable references**.

It is wrong, and the reason is that `canonicalAct` deliberately strips the
trailing year so that "Police Act" and "Police Act, 1861" share a key. The
**year the court printed survives in `act_named`**, which the extractor keeps
verbatim — and the year is the discriminating fact:

- A key matching **exactly one** held Act is **not automatically linkable.**
  "Motor Vehicles Act, 1939" keys to the same value as the held 1988 Act. They
  are different statutes; the 1939 Act was repealed. Linking them shows the
  advocate the wrong law, and a statute link carries no badge to distrust.
- A key matching **two** held Acts is **not automatically ambiguous.**
  "Police Act, 1861" names one of them exactly.
- A key matching two held Acts and printing "Police Act, 1983" is **neither** —
  it names a State Act we do not hold at all.

So the unit of classification is the `(act_key, act_named)` pair. 16,582 of
them, small enough to classify exhaustively.

**That single change refuses 2,445 references the key-level method would have
linked falsely, and recovers 149 it would have refused.**

---

## 4. The classification

| outcome | pairs | refs | share | writable |
| --- | ---: | ---: | ---: | :---: |
| `LINK_YEAR_CONFIRMED` | 721 | 246,131 | 28.53% | yes |
| `LINK_NAME_ONLY` | 340 | 74,449 | 8.63% | yes |
| `LINK_YEAR_RESOLVED` | 4 | 149 | 0.02% | yes |
| `REFUSE_YEAR_CONFLICT` | 470 | 2,445 | 0.28% | no |
| `REFUSE_AMBIGUOUS` | 2 | 244 | 0.03% | no |
| `REFUSE_UNHELD` | 15,045 | 539,176 | 62.51% | no |
| `REFUSE_NULL_KEY` | 0 | 0 | 0.00% | no |

**Linkable: 320,729 references (37.18%) across 265 Acts.**

Every refusal carries its own reason, per §7.2. None of them defaults to a link.

### Correction to R7's figure, and to my own first pass

R7's `DATA_GAP_PRIORITY_QUEUE_V1` G1 recorded **323,524**. Current measurement
is **320,729**. Both numbers are real; they answer different questions. R7 asked
the key-level question. This asks the pair-level one, and the difference is
almost entirely the year conflicts R7 could not see.

My own first pass this session also produced **319,953** — lower — because it
compared the printed year against `statutes.act_year` only. See §5.

---

## 5. A held Act has two legitimate years, and they disagree

`act_year` is the year of the enactment **numbering** — "Act No. 4 of 2016".
`short_title` carries the year the statute is **cited** by, which is the year a
judgment prints.

```
The Commercial Courts Act, 2015                 act_number 04   act_year 2016
The Competition Act, 2002                       act_number 12   act_year 2003
The Limited Liability Partnership Act, 2008     act_number 06   act_year 2009
```

Comparing only `act_year` refused **776 references** across those three Acts and
a few others — a false refusal, caught before this shipped. The fix accepts a
match on **either** year, both taken from the Act's own record. Nothing is
inferred and no alias table is invented: `DOMAIN_TRUTH.md` remains the only
place an Act alias may be recorded.

---

## 6. The refusals, and what each one actually wants

### 6a. `REFUSE_YEAR_CONFLICT` — 2,445 refs, and it is two populations

Reporting it as one number would hide that the halves want opposite work. Split
on a **mechanical string property**, claimed as nothing more:

| shape | pairs | refs | what it wants |
| --- | ---: | ---: | --- |
| `DIGIT_EDIT_1` | 247 | 873 | adjudication — **never** a link |
| `PREDECESSOR_CANDIDATE` | 223 | 1,572 | acquisition — a coverage gap |

`DIGIT_EDIT_1` is one character or one adjacent transposition away from a held
year: `1987`/`1897`, `1881`/`1981`, `1988`/`1998`, `1955`/`1956`. Almost
certainly a printed-year error. **This lane does not decide that a court's
printed year was a typo**, so these stay refused and are handed on as
candidates.

`PREDECESSOR_CANDIDATE` is the rest, and it is a real finding:

```
 326  Consumer Protection Act, 1986   held: 2019
 243  Motor Vehicles Act, 1939        held: 1988
 149  Limitation Act, 1908            held: 1963
  72  Specific Relief Act, 1877       held: 1963
  42  Cantonments Act, 1924           held: 2006
  29  Electricity Act, 1910           held: 2003
  26  Indian Forest Act, 1878         held: 1927
  19  Trade Marks Act, 1940           held: 1999
  17  Arms Act, 1878                  held: 1959
```

**Holding a successor is not holding the statute the judgment cites.** These are
correctly refused, and they belong in the acquisition queue rather than in a
repair queue. Judgments from the 1970s about the 1939 Motor Vehicles Act are
still cited today.

### 6b. `REFUSE_AMBIGUOUS` — 244 refs, exactly 2 pairs

```
243  "Police Act"          -> The Police Act, 1861 | The Police Act, 1949
  1  "Indian Tolls Act"    -> The Indian Tolls Act, 1851 | The Indian Tolls Act, 1864
```

The court named the Act without a year and we hold two. Nothing can resolve
these deterministically. They stay `AMBIGUOUS` with a reason.

Nine held Act keys collide under normalisation in total; only these two are ever
cited without a year.

### 6c. `REFUSE_UNHELD` — 539,176 refs, 62.51%, and most of it is three codes

```
280,027  CODE OF CRIMINAL PROCEDURE
 93,881  INDIAN PENAL CODE
 17,576  INDIAN EVIDENCE ACT
--------
391,484  = exactly G2
```

That is **72.6% of all unheld references from three statutes we do not hold.**
It independently reproduces R7's G2 figure from a different direction, and it is
§7.15's work.

The remaining **147,692** references over 10,214 keys are an act-name
normalisation gap, not a source gap. The shape is visible in the head:

```
7,220 POCSO ACT      2,932 IT ACT       2,836 SARFAESI ACT     967 LA ACT
3,282 CGST ACT       1,084 GST ACT        932 PC ACT           884 DSE ACT
2,110 INCOME-TAX ACT (vs 6,218 INCOME TAX ACT)
1,256 MOTOR VEHICLE ACT (vs the held MOTOR VEHICLES ACT)
1,787 BIHAR EXCISE ACT  ·  615 MP EXCISE ACT  ·  585 M. P. EXCISE ACT
```

Three separable classes: **abbreviations** an advocate uses daily, **punctuation
and singular/plural variants** of held Acts, and **State Acts** that are genuine
holdings gaps. Only the second is mechanically safe; the first needs
`DOMAIN_TRUTH.md` and the third needs acquisition. Sized here, not fixed here.

---

## 7. Section-text coverage — the link is not the same as the reading

Of the 320,729 linkable references, **320,532** point at an Act whose sections
we hold. **Four Acts** carry references but hold no section rows at all.

Linking the Act is what §7.2 asks and what this plan does. Whether the advocate
can then *read the section text* is a different fact, reported separately here so
nobody restates "323k statute links" as "advocates can now read the section".

---

## 8. The apply, and its measured cost

`scripts/n2-statute-link-apply.mts`. Default mode is DRY RUN; `--apply` is
refused without `--i-hold-heavy-box`.

| property | how it is actually obtained |
| --- | --- |
| deterministic | reads `statute-link-set.json`; does not re-derive live |
| exactly one target | refuses the file if any entry is not a single-target `LINK_` row |
| idempotent | `statute_id IS DISTINCT FROM $target` — a second run writes 0 |
| resumable | checkpoint at `services/ingest/.checkpoints/n2-statute-link.json`, by pair index and rows written |
| truth sample | `--sample N` prints (section, act as printed, act linked, case) before and after |
| progress | reports rows **written**, never pairs visited, at least every 60s |

**Dry run over the whole set, 25 Aug:**

```
link set          1,065 pairs, 320,729 refs
rows that WOULD change   320,729
rows already correct           0
elapsed                     49.6s
```

49.6 seconds to **count**. The write will be slower, and it is 320k rows on a
table of 862k. That is why this waits for the lease rather than being run now.

A bounded 60-pair dry run completes in 0.7s and moves 12,729 rows, so the
tranche-first requirement in §7.6's spirit is satisfiable here too: `--limit`
bounds the run and the checkpoint makes the continuation exact.

---

## 9. State

| item | state |
| --- | --- |
| classification | **`PROVEN`** — 16,582 pairs, exhaustive, every refusal reasoned |
| link set | **`PROVEN`** — 1,065 pairs, 320,729 refs, single-target checked twice |
| apply path | **`PASS_AT_MEASURED_SCOPE`** — dry run over the full set, 0 already-correct |
| execution | **`PREPARED_NOT_EXECUTED`** — waits on NEW1's `HEAVY_BOX` release |
| `DIGIT_EDIT_1` 873 refs | **`UNKNOWN`** — candidate only, never linked by this plan |
| `PREDECESSOR_CANDIDATE` 1,572 refs | **`NOT_HELD`** — acquisition, not repair |
| IPC/CrPC/IEA 391,484 refs | **`BLOCKED`** on §7.15 source reconciliation |
| 147,692 normalisation refs | **`NOT_MEASURED`** beyond the three-class split above |
