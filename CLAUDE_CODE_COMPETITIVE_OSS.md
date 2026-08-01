# LAWMIND — COMPETITIVE STRATEGY, OSS STACK, ANTI-OVER-ENGINEERING

Run this in Claude Code **after** the scope-revision prompt completes.

---

## PART 1 — INSTALL PONYTAIL FIRST

Before any other work in this session.

```
/plugin marketplace add DietrichGebert/ponytail
```
Then, as a **separate** prompt:
```
/plugin install ponytail@ponytail
```

MIT licensed, 92.9k stars. Measured on real agentic sessions against a real repo:
**−54% lines of code, −22% tokens, −20% cost, −27% time, 100% safety retained.**
It is the only arm in that benchmark that cuts every metric while staying fully
safe.

It stacks with caveman, which is already in the stack — caveman shrinks what the
agent *says*, ponytail shrinks what it *builds*. No overlap.

The ladder it enforces, which is exactly the discipline this project needs:

```
1. Does this need to exist?   → no: skip it
2. Already in this codebase?  → reuse it
3. Stdlib does it?            → use it
4. Native platform feature?   → use it
5. Installed dependency?      → use it
6. One line?                  → one line
7. Only then: the minimum that works
```

Run at `full`. Use `/ponytail-review` at the end of every sprint before the gate,
and `/ponytail-audit` once after S2.

Record in `.ai/02-tools.md` under a new **Build discipline** heading, and add one
line to `.claude/hooks/reanchor.sh`: *"Ponytail ladder applies to every build
decision. The best code is the code you never wrote."*

**One caveat to record:** ponytail's own docs note that trust-boundary validation,
data-loss handling, security and accessibility are never on the chopping block.
For us, add a fourth: **the citation verification pipeline is never simplified.**
If ponytail suggests collapsing a tier, decline and note it.

---

## PART 2 — COMPETITIVE POSITION

Update `PRODUCT_BRIEF.md` with this section and create `docs/COMPETITIVE.md`.

### The market as it actually is

| Tier | Who | Price | What they sell |
|---|---|---|---|
| Institutional databases | SCC Online, Manupatra | SCC Online AI Pro ₹51,500/user/yr + 18% GST (~₹5,000/mo); Manupatra quote-only | Authority and comprehensiveness. SCC headnotes are what judges prefer |
| Free government | e-SCR (Supreme Court) | Free | Neutral citations, court-formatted PDFs. **Genuinely good now** |
| AI research | CaseMine (AMICUS), LegitQuest (iSearch/iDraf/iDigest), VIDUR AI, BharatLaw.AI, Jhana | Mid | Semantic search over Indian law |
| Consumer apps | Law4u, Lawyyar, LegalKart | Free + IAP | Library breadth, 18 languages, advocate finder |
| Case tracking | Notify Court Case Status, Provakil | Low | Cause lists, hearing reminders |
| Global | Harvey (AZB, Shardul Amarchand, S&A), Lexis+ AI | $1,000+/seat/mo | BigLaw only |
| Free chatbots | NyayGuru, KanoonGPT, Niyam.ai | Free | Q&A, no verification |

### The three facts that define our strategy

**1 — Raw judgments are commoditised.** e-SCR is free, high-performance and
carries neutral citations. Do not position on corpus size; we will lose to a
government service that costs nothing. **The corpus is table stakes, not the
product.**

**2 — Everyone sells a database. Nobody sells a workflow.** The most telling line
in the 2026 landscape review: firms run ₹15-lakh subscriptions as glorified
citation lookup because nobody trained the juniors. *The tool isn't the
bottleneck. The workflow is.* Our daily loop — cause list, briefing, draft, share
— is the thing no incumbent has.

**3 — Verification is now compliance, not a feature.** India in 2026 has a
Supreme Court misconduct standard for unverified citations, and advocates are
being cautioned about High Court cost orders. **Reframe the badge from a warning
to a shield.** Not "we're checking on you" — "you're covered." Update every piece
of verification copy accordingly.

### Our position, in one line

**The only tool that turns tomorrow's listing into a prepared advocate — with
citations that survive a misconduct challenge.**

Not the biggest database. Not the cheapest chatbot. The daily working instrument.

### Pricing — we sit inside an existing budget line

A solo already allocates ₹30,000–50,000/year for research (₹2,500–4,200/month).
Expert at ₹3,499 is **inside that budget**, not on top of it. We are a switch, not
a new spend. SCC Online at ~₹5,000/month is the number to anchor against.

Rewrite the pricing rationale in `PRD.md` on this basis.

### The launch play — free for three months

Founder's decision. Record it: **all tiers free for the first 90 days after
launch, for anyone who signs up in that window.**

Structure it so it builds a moat rather than just buying downloads:

- Free access is granted per user, not per period — early users keep the
  discount as a permanent "founding advocate" rate at 50% after the free window.
  This converts the free cohort instead of churning it.
- The free window is what fills the matter workspace. Ninety days of accumulated
  matters, briefings and drafts is switching cost that no competitor can undo.
  **The free period is a data-moat play, not a marketing spend.**
- Cap it. "First 5,000 advocates" creates urgency and bounds the LLM cost.
- Firm and Enterprise are excluded — those are invoiced sales and should never be
  free.

Record the cost exposure: at 5,000 free users on the routed model mix, three
months of LLM spend is the number to model before committing. Compute it and put
it in `docs/COMPETITIVE.md`.

### Where each competitor is beatable

| Competitor | Their weakness | Our move |
|---|---|---|
| SCC Online / Manupatra | ₹51,500/yr, desktop-first, no case tracking, no briefing | Mobile-first, 1/15th the price, the daily loop they have no answer to |
| e-SCR | Search only. No matters, no drafting, no alerts | Never compete on corpus. Integrate it as a source |
| Law4u | Huge library, no verification, no workflow, ad-supported feel | Verification as compliance + the daily loop |
| Notify Court Case Status | Tracks listings, generates nothing | We turn a listing into a prepared advocate |
| CaseMine / LegitQuest | Research only, no matter workspace | Research is one tab of four |
| Harvey | ₹1L+/seat, BigLaw only, no Indian court data | We own the 1.7M advocates they will never serve |
| Free chatbots | No verification — actively dangerous under the new standard | This is our sharpest wedge. Name it |

---

## PART 3 — OSS FIRST: DO NOT BUILD WHAT EXISTS

Founder's instruction: search for a maintained OSS project before building any
non-differentiating component. Create `docs/OSS_STACK.md` recording each choice,
its licence, and why it was picked.

**Licence rule:** MIT, Apache 2.0 and BSD are fine. **AGPL is not** — it would
force us to open-source the server. Check every licence before adopting, and
record it.

### Already decided

| Need | Use | Licence |
|---|---|---|
| OCR — primary | **PaddleOCR** | Apache 2.0 (**not MIT** — correct this if written as MIT anywhere) |
| OCR — fallback | **Tesseract** | Apache 2.0 |
| Indian language translation | **IndicTrans2** (AI4Bharat) | MIT |
| Indian language corpus | **IndicCorp v2** (AI4Bharat) | CC-0 |
| Fine-tuning | **Unsloth** + HF PEFT + TRL | Apache 2.0 |
| Build discipline | **ponytail** | MIT |

### Search before building — each of these

For every row: find the leading maintained project, check licence, stars, last
commit and open issues, then record the pick or record why nothing fits.

| Component | What to look for |
|---|---|
| PDF → text, digital | pdfplumber vs PyMuPDF. Note PyMuPDF is AGPL — likely disqualifying |
| Devanagari and Indic NLP | AI4Bharat's IndicNLP suite, indic-nlp-library |
| **PII / NER for Indian names** | Presidio (Microsoft, MIT) as the base. Indian names, transliteration variants and Devanagari need evaluation on real court documents — do not trust English benchmarks |
| Legal citation parsing | Anything for Indian citation formats. If nothing exists, this is genuinely ours to build |
| `.docx` generation | docx / python-docx. **Must open cleanly in Word — this is non-negotiable for filing** |
| PDF generation | ReportLab vs WeasyPrint. **Must embed Noto Devanagari correctly** |
| Full-text + vector search | Postgres FTS + pgvector already chosen. Confirm no better hybrid ranker exists before writing our own RRF |
| Cross-encoder reranking | sentence-transformers rerankers |
| Job queue | BullMQ or pg-boss. **Do not write a queue** |
| Outbox / offline sync | An existing pattern library before rolling our own |
| Cause list / eCourts parsing | Search for existing eCourts scrapers. Several exist. Check licence and freshness |
| i18n | i18next. Do not hand-roll |
| PDF viewing in Expo | react-native-pdf or equivalent |

**Report anything where nothing suitable exists.** That list is our actual
engineering surface, and it should be much smaller than the feature list.

---

## PART 4 — THEN

Re-run the cross-reference checker and both hooks.

Run `/ponytail-audit` on the repo and report what it flags. Documentation will not
trigger much, but the audit establishes the baseline before S0 writes code.

Report: what ponytail changed about the plan, what OSS replaced planned work, and
the free-period cost model.

Do not scaffold the monorepo.
