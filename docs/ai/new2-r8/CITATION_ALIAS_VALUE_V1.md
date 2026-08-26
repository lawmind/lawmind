# CITATION_ALIAS_VALUE_V1 — R8.1 §7.16

**Lane:** NEW2 · **26 August 2026**
**We hold reporter citations for 38,342 documents and for 3 others. Reporter form is ~78% of real citations and 2.38% of them resolve.**

---

## 1. What we hold

| | documents | neutral citation | reporter citations |
| --- | ---: | ---: | ---: |
| Supreme Court | 38,342 | 38,215 (**99.67%**) | 38,342 (**100%**) |
| **High Courts** | 18,660,642 | 1,332,477 (**7.14%**) | **3** |

Two facts, both consequential:

- **100% of Supreme Court documents carry reporter citations** — because the SC
  corpus *is* the SCR reporter edition (`REPORTER_APPARATUS_V1`: 93.2% carry
  reporter page furniture). The alias coverage and the licensing exposure are
  the same artifact, again.
- **Three High Court documents in 18.7 million carry a reporter citation.**
  Not 3%. Three rows.

And **92.86% of High Court judgments have no neutral citation either.** For the
overwhelming majority of the corpus we hold no citable identifier of any kind.

---

## 2. What that costs at resolution time

Citation forms in `judgment_citations`, on a 0.5% `TABLESAMPLE`:

| form | n | resolved | resolved % |
| --- | ---: | ---: | ---: |
| `OTHER` — not a citation | 83,792 | 272 | **0.32%** |
| `REPORTER` — AIR / SCC / SCR / CriLJ / ILR / … | 23,459 | 558 | **2.38%** |
| `NEUTRAL` | 6,534 | 109 | **1.67%** |

The `OTHER` bulk corroborates NEW2's R7 finding that **72.08% of the citation
table is not a citation at all.** Among rows that *are* citations, reporter form
is **~78%** and neutral **~22%** — consistent with R7's 75.584%.

**Reporter form is the dominant way Indian judgments are cited, and 97.6% of
those references do not resolve.** They cannot: the target is almost always a
High Court judgment, and we hold reporter aliases for three of those.

---

## 3. The §7.16 verdict on provider signals

§7.16 asks for the *current value* of official SC parallel-citation material and
of the already-authorised BharatLaw / Supreme AI candidate signals.

| source | measured value now |
| --- | --- |
| official SC parallel/equivalent citations | **near zero marginal value.** We already hold reporter citations for 100% of SC documents. |
| **BharatLaw / Supreme AI aliases for High Courts** | **the highest-value alias signal available**, and the only route measured here to the 18.66M documents with no reporter identifier |
| Indian Kanoon | **`NOT_AUTHORIZED`.** §17 forbids use from stale authorisation assumptions and nothing here reopens it. |

**The value is entirely in High Court aliases.** That inverts the intuition that
the Supreme Court material is the prize — it is the part we already have.

### The bounds that do not move

Per §7.16 and CLAUDE.md §6a, any provider row is **candidate / teacher /
metadata only**:

- every row keeps `source`, `license` and `provenance`;
- **canonical truth needs primary verification** — a provider alias may propose
  that *X* equals *Y*, and only the primary record may confirm it;
- a provider alias may never be written as `verified_by_source = 'corpus'` or
  carry a human's badge. The citation harness is not relaxed for a convenient
  source;
- BharatLaw and Supreme AI are authorised (founder record, through 13 Nov 2029);
  `Supreme Today` is a **different source** and is not covered by that record.

---

## 4. What is not claimed

- **No acquisition was performed and no provider was called.** This measures
  what we hold and what it costs; it does not fetch.
- **The form classifier is lexical and unadjudicated.** `OTHER` at 72% is
  consistent with R7's independent 72.08%, which is corroboration, not proof.
- **The 2.38% resolution rate is not a defect rate.** Much of it is
  `TARGET_NOT_HELD` — the cited authority genuinely is not in the corpus — which
  is a coverage problem, not a resolver problem. Separating those two is
  `NOT_MEASURED` here.
- **`SHARED_NEUTRAL_RCA_V1` bounds the ceiling.** Even perfect alias coverage
  would not make neutral citations unique: a neutral citation identifies a
  disposal event, and 361,044 judgments share one.

---

## 5. State

| item | state |
| --- | --- |
| SC reporter-citation coverage 100% | **`PROVEN`** |
| HC reporter-citation coverage = 3 rows | **`PROVEN`** |
| HC neutral-citation coverage 7.14% | **`PROVEN`** |
| reporter form ~78% of real citations | **`PASS_AT_MEASURED_SCOPE`** — 0.5% sample |
| reporter resolution 2.38% | **`PASS_AT_MEASURED_SCOPE`** |
| official SC parallel material | **low marginal value** — already held |
| HC aliases from authorised providers | **highest-value alias signal** |
| Indian Kanoon | **`NOT_AUTHORIZED`** — unchanged |
| resolution failure split: not-held vs unresolvable | **`NOT_MEASURED`** |
| provider acquisition | **none performed** |
