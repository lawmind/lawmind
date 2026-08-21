# BHARAT.LAW / NyaI WORK QUEUE — hard cases only, ranked

**NEW3, 17 Aug 2026.** "Bharat Nyai" in this session's mission brief resolves
to **Bharat.Law's `/nyai` product** — no separately-branded "Bharat Nyai"
entity exists (`grep` for the name returns zero hits repo-wide). Full
product read: `docs/BHARAT_LAW_OFFER.md`. That doc's own §8 already scoped
a "buy one month, use it as a lawyer would" plan before this session's
authorization existed — this queue is that plan, expanded to the mission's
hard-case categories and made ranked.

**Authorization: `docs/FOUNDER_QUEUE.md` FQ-IK-RESOLVED, 17 Aug 2026** —
founder confirmed live, supersedes both `BHARAT_LAW_OFFER.md` §8's own
"and extract nothing, their AUP forbids benchmarking" caution and the
`extractionPermitted: false` contract reading, for benchmark/distillation/
training use specifically. **Scope/budget still unconfirmed** (that entry's
own GUESS flag) — this is a ranked plan, not a signed-off spend. Buy
nothing until scope is confirmed a second time.

**What NyaI actually is, so this queue doesn't chase the wrong thing**
(`BHARAT_LAW_OFFER.md` §5): **model-agnostic orchestration over
third-party frontier models, not a trained model** — "no weights to learn
from." Its treatment/citation output is **computed, not editorially
curated** (no editorial desk, company founded 2023) — so what's worth
extracting is *how it behaves on hard inputs*, not its answers as ground
truth. Credit-metered: **10,000 AI credits/month on the ₹1,499 Pro tier** —
this queue is written to fit inside one month's credits, not to maximize
volume.

---

## P0 · the 32 treatment gaps this lane already knows we cannot resolve — CORRECTED 17 Aug 2026

**Correction, found cross-checking CX1's citation-graph census
(`docs/ai/CX1_CITATION_GRAPH_CENSUS.md`, workstream J2, flagged
P0-currentness-risk independently): this section previously said "7
overruled_in_part edges" and listed 5 with a fabricated "+2 more." Verified
directly against `TREATMENT_GRAPH_GAP.md`'s own row table — it is exactly
**5** overruled_in_part rows, not 7. The "+2 more" had no basis and is
struck.**

**The real, larger opportunity CX1's cross-check surfaced: the
`overruled_in_part` subset was never the whole population.**
`TREATMENT_GRAPH_GAP.md` §1 also lists **28 unresolved `overruled` rows and
1 `doubted` row** — 34 total, 32 live after 2 already fixed (Sun Export
Corp, SEBI v. Roofit, both now correctly linked by LCC). **This is the
single highest-severity population in the whole citation graph** —
`CLAUDE.md`'s own zero-threshold rule: *"overruled law rendered WITHOUT the
LAW MOVED mark is as severe as a hallucination."* CX1 reached the same
conclusion independently (P0-currentness-risk), not duplicated work, a
second confirmation.

**The 5 `overruled_in_part` rows below remain the P0 test set** for the
reason originally stated — `BHARAT_LAW_OFFER.md` §8 named this exact
category (*Kharak Singh*, *Danamma*-type partial-overrule questions) as the
sharpest test of whether NyaI's treatment call is curated or vague. **The
full 32-row population (28 overruled + 5 overruled_in_part + 1 doubted) is
the wider queue** — see `TREATMENT_GRAPH_GAP.md` §1 for the complete list
rather than duplicating all 34 rows here.

| citation | citing judgment | citing date |
| --- | --- | --- |
| (2013) 8 SCC 781 | Surendran v. State of Kerela | 2022-05-13 |
| (2015) 13 SCC 713 | M/S Lion Engineering Consultants v. State of M.P. & Ors. | 2018-03-22 |
| AIR 2015 SC 710 | M/S Lion Engineering Consultants v. State of M.P. & Ors. | 2018-03-22 |
| (2017) 4 SCC 150 | Santhini v. Vijaya Venketesh | 2017-10-09 |
| 2000 (4) SCC 130 | United India Insurance Co. Ltd. v. Shila Datta & Ors. | 2011-10-13 |

**Test, not extraction**: query each target's treatment status through
NyaI, record whether the answer is specific (a named paragraph, a named
overruling case, a stated date) or generic (*"partly overruled,"* no
support). §5's own read: a specific, right answer means the data is
curated and worth respecting as a second signal; a vague one confirms it's
computed the same way LawMind's own 11,765-edge extractor already works,
and nothing is gained by trusting it over our own. Either outcome is
useful; neither requires believing NyaI's answer without checking it
against the primary judgment text LawMind already holds.

Cost: 7 queries, well inside one day's credit allowance.

---

## P1 · counter-authority — does NyaI surface what we'd want cited against us

Mission category: *counter-authority*. Construct 5–10 queries from
LawMind's own top cross-court unresolved authorities
(`MISSING_AUTHORITY_QUEUE.md` §2, `distinct_courts ≥ 8` rows — `20064SCC1`,
`20142SCC1`, `19973SCC261`, `19934SCC727`, `19988SCC1`) framed as an
advocate would: *"what would the other side cite against this proposition"*
rather than *"what does this case say."* This tests NyaI's counter-authority
surfacing specifically, which `BHARAT_LAW_OFFER.md` §8 flagged as unread —
their page shows a counter-authority feature but this lane never exercised
it.

**Value if it's good**: a research-failure-mode LawMind doesn't yet cover
(retrieval that argues both sides), worth naming as a product gap for
NEW1/RCC even without adopting their approach. **Value if it's weak**: rules
out a feature LawMind might otherwise have assumed was table stakes to
match.

---

## P2 · long-document intelligence — "10k+ Pages per matter" claim, tested

Mission category: *long-document problems*. Their own site claims "10k+
Pages per matter" handling. Pick one of LawMind's own longest-held
judgments or a multi-judgment matter bundle (construct one from 3-4 related
citing/cited judgments already in the corpus) and run a synthesis query —
does it correctly track cross-references across the full set, or does it
degrade the way most retrieval-over-long-context systems do past a
threshold? This is exactly the kind of test that requires *running* the
product, not reading marketing copy — `BHARAT_LAW_OFFER.md`'s own research
never went past the pricing/features page.

---

## P3 · currentness — good-law status on a genuinely live question

Mission category: *currentness*. Pick 2-3 recent (2024-2026) Supreme Court
decisions with unsettled or actively-litigated good-law status — not the
P0 set (those test accuracy on a *known* answer), these test **whether
NyaI's "re-checked at delivery" claim (`BHARAT_LAW_OFFER.md` §8b.3) is real
or marketing.** A stale answer on a genuinely live question is the
sharpest possible test of that specific claim.

---

## WHAT THIS QUEUE DELIBERATELY EXCLUDES

- **No trivial questions.** Every item above targets something LawMind's
  own extractor has already failed at, or a claim on their site this lane
  could not verify by reading alone. Per the mission's own instruction:
  *"do not waste credits on trivial questions LawMind already solves."*
- **No model/weight extraction attempt.** `BHARAT_LAW_OFFER.md` §5 already
  established there is nothing to extract in that sense — NyaI is
  orchestration, not a trained model. This queue tests behavior, not
  weights.
- **No adoption of their treatment output as ground truth**, even where the
  founder authorization now permits recording it. `CLAUDE.md` still forbids
  training on another model's commentary about law — what this queue
  produces is a *comparison record* (does our extractor agree with theirs,
  and on what does it diverge), decomposed against LawMind's own primary
  sources before anything is kept, per the mission's provider-independence
  test.

## COST

5 (P0 test set) + ~8 (P1) + ~3 (P2) + ~3 (P3) ≈ 19 queries for the tiers
above, or up to 32 if the full treatment population is worked. Comfortably
inside 10,000 monthly credits on the ₹1,499 Pro tier either way — cost is
the subscription, not the query volume.
