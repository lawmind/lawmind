# TECHNICAL MOAT — what we can build that they cannot buy back

Researched 8 August 2026, from primary literature. **Supplements
`docs/COMPETITIVE.md` (position), `docs/COMPETITIVE_TEARDOWN.md` (features, incl.
§8 Bharat.Law) and `docs/GTM_INDIA.md` (distribution). Does not restate them.**

The founder's framing, and it is the right one:

> *"We cannot buy the time these competitors have already spent. But in this new
> AI age we can build something better in terms of looks, premium feel,
> user-friendliness, and a highly polished industry-standard production app."*

Both halves are true, and the second needs a caveat that this file exists to
supply: **polish is not a moat.** A better-looking app is copied in a quarter.
What cannot be copied in a quarter is an architecture a competitor would have to
tear their product apart to adopt — and a measured number they cannot answer.

So this file asks one question of every candidate: **if a well-funded competitor
saw us do this on Monday, how long until they have it?** Anything under six
months is a feature. This file is about the rest.

---

## 1 · The single most important research finding this week

**LegalCiteBench** (arXiv 2605.10186) evaluated **21 models** — GPT-4o-mini,
Claude-Sonnet-4.5, Gemini-2.5-Flash, DeepSeek-Chat-v3.1, Llama 1B–70B, Qwen
4B–30B, Mistral-7B, Phi-4, and **SaulLM-54B** (legal-domain pretrained) — on
whether they can recover, complete, verify and match judicial citations **without
an external database**.

| Measure | Result |
| --- | --- |
| Citation retrieval, closed-book (Cat1) | **best model 6.80 / 100** |
| Citation completion (Cat2) | **best model 6.35 / 100** |
| Models exceeding **94% Misleading Answer Rate** | **20 of 21** |
| Claude-Sonnet-4.5 MAR | **96.79%** |
| Best MAR (gpt-5-mini) | still **89.24%** |
| Citation **error detection** (Cat3) | **75.59** (SaulLM-54B) |
| Case **verification** (Cat4-2) | **67–96** |

**Misleading Answer Rate** is the proportion of low-scoring responses that supply
a concrete citation *instead of abstaining*. It measures confident fabrication —
the precise failure that ended in *Pooja Ramesh Singh* (2026 INSC 668).

### Four consequences, and one of them contradicts a plan of ours

**1 · The 10–50× generation-verification asymmetry is our architecture, measured.**
Models score under 7/100 generating citations and 67–96 verifying them. The
paper's own recommendation: *"build systems where models audit human-provided
citations rather than generate them independently."* That is
`CITATION_HARNESS.md` steps 2–3 — the model may reference only judgment IDs
handed to it in retrieved context, and never emits a citation from memory.
**We did not derive this from the paper; the paper independently arrived at our
spec.**

**2 · Scale does not fix it.** Llama-3.1-70B scores **3.82** on Cat1 against
Llama-3.1-8B's **1.47** — nine times the parameters for almost nothing. Anybody
waiting for the next model to solve hallucinated citations is waiting for
something that is not coming.

**3 · Domain fine-tuning does not fix it either, and this contradicts an
assumption worth correcting.** **SaulLM-54B is pretrained on legal text and still
scores 3.77 on citation retrieval** — while topping error *detection* at 75.59.
`docs/TRAINING_STRATEGY.md` treats a fine-tune as a quality lever. This says
plainly: **a fine-tune will improve how the model reads and judges law, and will
not make its citations real.** Only grounding does that. The training plan is not
wrong, but its expected benefit needs re-stating in the right column.

**4 · Abstention is a partial mitigation, not a solution — and we already go
further.** Explicit uncertainty instructions cut Llama-3.1-8B's MAR from 100% to
62.7% **without improving correctness.** Bharat.Law's stated safe behaviour is
exactly this: *"a 'not found' response is safer than a fabricated citation."* It
is safer. It is also the thing `CITATION_HARNESS.md` forbids at a **zero
silent-drop threshold**, because after 2026 INSC 668 an advocate must
*demonstrate* verification and **an absence demonstrates nothing.**

> **Marketing consequence, and it is large.** A peer-reviewed benchmark now says
> every frontier model fabricates citations **over 94% of the time** when it has
> nothing to ground against, and that verification-first architecture is the
> answer. That is not our claim about our competitors — it is the literature's
> claim about the entire category, and we are the only Indian product whose
> published spec was already built that way. Cite the benchmark, never the
> competitor.

---

## 2 · Offline — the moat nobody is even attempting

**The condition:** a district court basement, no signal, a matter called in four
minutes. `COMPETITIVE_TEARDOWN.md` §5 already lists offline as *"hard
requirement, ours to win"* with every competitor at "—". Nothing has changed
except that it is now demonstrably buildable.

**`sqlite-vec` runs on Android and iOS**, is a dependency-free C extension, and
**`op-sqlite` has built-in support for it in React Native** — which is our stack.
It stores Float32/Float16/**Int8**/**1-bit** vectors as BLOB columns and handles
**thousands to a few million vectors with single-digit-millisecond queries.**

**Why this is a real moat and not a feature:**

- **It is an architecture, not a screen.** A competitor serving search from a web
  backend cannot add offline retrieval without building a second, on-device
  retrieval path and a sync protocol. That is not a quarter's work.
- **It compounds with everything else we have decided.** PD-4's private-by-default
  notes, the matter workspace as retention moat, one-handed courtroom use — all
  of them assume the phone is the primary surface. Offline is the same bet paid
  off.
- **It is invisible in a feature-comparison table and decisive in a bar room.**
  "It works in the basement at Tis Hazari" is the kind of claim that spreads
  sideways between advocates, which `GTM_INDIA.md` §1 identifies as the only
  channel that matters.

**What it does NOT mean, stated before anyone over-promises.** The full corpus is
616,197 embedded chunks and does not go on a phone. Offline means **the
advocate's own matters, their saved authorities, and the judgments they have
opened** — which is what they need in the basement. And an **offline citation
cannot be re-verified**, so `overruled_status` — never cached, by rule — must
render as *"last checked at 08:14 today"* rather than silently as good law.
**That rule survives offline or offline does not ship.**

---

## 3 · The citator — where honesty beats parity

`COMPETITIVE_TEARDOWN.md` §8: Bharat.Law surfaces dissents, overruling decisions
and contrary coordinate-bench views per citation. Supreme Today's Authority Check
classifies treatment positive / negative / neutral over forty years of editorial
work.

**The literature says catching up by classification is harder than it looks.**
Treatment classification has been a known-hard NLP task since Galgani and
Hoffmann; a 2019 survey found most neural architectures performing poorly; and
the 2026 benchmark on multi-label precedent treatment (arXiv 2605.17691) exists
precisely because commercial citators — Shepard's, KeyCite, Bloomberg — run
**29-step editorial processes with human attorneys.** Nobody has automated this
to editorial quality.

**So do not claim parity. Claim something they cannot: the court's own words.**

We hold **192,197 citation edges**, 44,785 resolved, **11,765 carrying a treatment
other than a bare mention** — 10,437 `followed`, 1,233 `distinguished`, 69
`overruled`, 19 `overruled_in_part`, 7 `doubted` — and **11,765 with the citing
court's own phrase stored in `evidence`**.

That last column is the product. A classifier says *"negative treatment"* and asks
to be trusted. **We can show the sentence in which the later court said it, and
the advocate decides.** `propagate-cli.ts` already prints it:

```
KHARAK SINGH versus THE STATE OF U. P. & OTHERS
  overruled_in_part
  by: JUSTICE K S PUTTASWAMY (RETD.) versus UNION OF INDIA (2017-08-24)
  evidence: - partly overruled
```

**And `partly_set_aside` is the fight worth picking.** It is the state a
three-way positive/negative/neutral classifier structurally cannot express.
*Kharak Singh* is not bad law; part of it is. An advocate told either "fine" or
"overruled" has been misled in both directions. **Getting one state right, with
the paragraphs named, beats matching forty years of headnotes** — and it is
blocked on exactly one thing: paragraph extraction, because `SCHEMA_TRUTH.md`
requires `overruled_paras` and we extract none.

---

## 4 · What "premium" costs, technically

The founder is right that a polished app is winnable. It is also the most
copyable thing here, so it earns its place only where it is **load-bearing for
trust**. Four places where it is:

**Latency is a trust signal, not a performance metric.** Gate S1 budgets **3
seconds for the entire search request**. A tool that takes eight seconds is not
"slower" to an advocate with a matter being called — it is unusable, and they
will not try it twice. This is why `ab-cli.ts` measures reranker latency beside
its accuracy: a lever can be accurate and still not ship.

**Typography is legal infrastructure.** Hindi renders in **Noto Sans Devanagari
everywhere including PDF export** — already a hard rule. A Devanagari draft that
renders with fallback glyphs in a filed PDF is not an aesthetic failure; it is a
document an advocate cannot file.

**Restraint reads as seniority.** Verified citations carry no badge. A screen
that decorates every correct answer teaches the eye to skip decoration, and then
the one warning that matters is invisible. Amber `#B4690E` means the law has
moved **and nothing else** — a reserved colour is a premium decision that costs
nothing and cannot be copied without the discipline behind it.

**The verification record is where premium and defensibility meet.** Every field
already sits in `citation_checks`: state, source, `shown_to_user`,
`overruled_status_shown`, `surface`, `match_confidence`, timestamps — and
`verified_by_source = 'ecourts'` meaning a named human vouched. **Nothing renders
it.** After 2026 INSC 668 an advocate must be able to answer *"did you verify
this?"*, and **no competitor — Supreme Today, Bharat.Law, SCC Online, Prism —
offers anything to answer with.**

---

## 5 · Ranked, by how long a funded competitor would need to copy it

| Moat | Copy time | Status |
| --- | --- | --- |
| **Verification record** an advocate can file | **12+ months** — needs per-citation, per-surface provenance recorded from day one; cannot be retrofitted onto logs that were never kept | Every field stored, nothing rendered |
| **Offline-first retrieval** | **9–12 months** — a second retrieval path plus sync, on a web-first product | Buildable now: sqlite-vec + op-sqlite |
| **Self-hosted vernacular OCR** ("the file never leaves") | **6–9 months** — plus a privacy story their frontier-API routing contradicts | Our stack is classical and at the benchmark floor |
| **Paragraph-level `partly_set_aside`** | **6–9 months** — needs the edges AND the paragraphs | Edges exist; paragraphs do not |
| **Published Gate S2 numbers, with methodology** | **immediate to state, months to earn** | **Currently failing: success@5 24.0%** |
| The daily loop | 3–6 months | Ours, unclaimed |
| A better-looking app | **one quarter** | Necessary. Not a moat. |

**The order to build in is not the order of that table.** It is
`GTM_INDIA.md` §9: Gate S2 passes first, because every other row is a claim, and
a claim that fails in a bar room costs that bar room permanently.

---

## 6 · What I am NOT claiming

- **LegalCiteBench is US case law.** Its architectural findings — the
  generation-verification asymmetry, scale insensitivity, MAR — are about model
  behaviour and travel. Its absolute scores do not transfer to Indian citations.
- **The treatment-classification literature is US/French.** No Indian benchmark
  for precedent treatment was found; if none exists, **that is an opportunity, not
  a gap** — see the harness, which is already the only fixed Indian query set with
  relevance defined before measuring.
- **sqlite-vec on-device is documented, not measured by us.** Single-digit-ms on
  "modern hardware" is the vendor's claim. A ₹12,000 Android phone in a basement
  is the real test and it has not been run. **RCC's lane, and it needs a number
  before anything is promised.**
- **No competitor has been tested hands-on.** Still true, still the highest-value
  next research step, now with a named first target.
- **Surya's weights** may carry a separate commercial term from its Apache-2.0
  repo. Verify before use.
