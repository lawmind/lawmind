# MODEL STRATEGY — what we train, what we buy, and what we must never attempt

Written 9 August 2026. Answers a question the founder has asked several times in
different forms: *given the corpus, the licences and the teacher data, what model
should Lawmind actually have?*

**The short answer: we should not train a model that knows Indian law. We should
train models that CHECK things.** Everything below is the argument for that.

---

## 1 · The distinction that decides everything

There are two completely different jobs an LLM can do here, and they have
opposite economics.

| | **Closed-book recall** | **Reading and checking** |
| --- | --- | --- |
| The question | *"What did* Kesavananda *hold?"* answered from weights | *"Does this paragraph support this claim?"* |
| What it needs | The corpus compressed into parameters | A short passage and a claim, both supplied |
| Failure mode | **Fabricates fluently** | Says the wrong word — visible, checkable |
| Can we win it? | **No, and no amount of money changes that** | **Yes** |

**Closed-book recall is information-theoretic and we lose it by construction.**
38,341 judgments is on the order of a billion tokens of primary text. Compressing
that into weights and reading it back exactly is not a training problem, it is a
compression problem with a hard floor. A model that has *nearly* memorised
`(2019) 4 SCC 221` produces `(2019) 4 SCC 212`, confidently, and that is the one
error this product cannot survive.

**This is why the architecture documents' central rule is right**: the model
never emits a citation, it emits an evidence ID that the application resolves.
`docs/RETRIEVAL_ARCHITECTURE.md` §1.

**Reading and checking is different in kind.** The passage is in the context. The
claim is in the context. The model is not asked to remember anything — it is
asked to compare two short pieces of text. **That is a small-model task**, it is
cheap, and it is where every rupee of training effort should go.

---

## 2 · So what do we actually train?

**Nothing, yet.** In priority order, and the first two are not training at all:

1. **Retrieval.** Gate S2 is failing at success@5 = 24%. **No model fixes a
   document that was never retrieved.** Query-side levers, the citation graph
   and chunking come first because they raise the ceiling everything else sits
   under.
2. **Reranking.** A cross-encoder over retrieved candidates. We have measured
   one: **+6.0 points, McNemar p = 0.210 — does not ship.** That is a
   measurement problem (n too small), not a verdict.
3. **The claim-support verifier.** FQ-R1. Input: a claim and a cited paragraph.
   Output: one of five states. **This is the model worth having**, and it is
   small enough to run on the RTX 4060 Ti.

**Note what is absent: a "Lawmind legal LLM".** There is no version of that which
beats DeepSeek or Claude at reasoning, and every version of it is worse at
citations than a database lookup.

---

## 3 · Why our harness is unusually well-suited to RLVR

**Reinforcement learning from verifiable rewards** needs a reward that is
computed, not judged. Most domains do not have one; law mostly does not either —
*"is this a good submission"* has no machine answer.

**But the citation harness IS a verifiable reward, and that is a genuine asset.**
Every one of these is a machine-checkable fact about an output:

- Does the cited judgment exist in the corpus? (`hallucinationRate`)
- Was a retrieved citation dropped from the answer? (`silentDropRate`, threshold **0**)
- Was overruled law rendered without the mark? (`staleOverruledRate`, threshold **0**)
- Does the cited paragraph support the claim? (FQ-R1, not yet built)

**No judge model is needed for any of them**, which matters because
`DATASETS.md` forbids training on another model's commentary about law. A reward
computed from our own corpus is not commentary — it is a lookup.

**The honest caveat**: RLVR on a reward this sparse tends to teach *abstention*.
A model punished for wrong citations and not rewarded for useful answers learns
to say nothing. **The reward must include a usefulness term before any of this is
attempted**, and we do not have one.

---

## 4 · Distillation — what it means here and what it does not

The founder's clarification is the operative definition and it is narrower and
better than the usual one:

> *We ask them about citations, they give real citations back, and we record
> those answers so we do not have to keep paying the licence.*

**That is not training on their prose. It is recording facts they resolved.** A
citation is not their creative work; it is a fact about what a court published.
`CLAUDE.md`'s bar — never train on another model's *commentary about law* — is
not crossed by recording which authority answers which citation string.

**Three constraints that follow, all already built:**

- **Their answer is a candidate, never ground truth.** Everything resolves
  against our own corpus before it counts. Both architecture documents say this
  and they are right.
- **`verified_by_source = 'licensed'`** exists precisely so a publisher's
  editorial view cannot wear the badge of something we confirmed ourselves. It
  ranks **below** `ecourts_bulk`.
- **A display gate defaults to false.** A withheld headnote renders as null,
  never as a truncated version of theirs.

**And one target that turned out not to exist.** Bharat.Law's NyaI is
*"model agnostic"* — an orchestration layer over third-party models. **There are
no weights to distil.** `BHARAT_LAW_OFFER.md` §5.

---

## 5 · Which model for which call, and why the rule is about data not difficulty

`CLAUDE.md` routes by **data sensitivity**, and that is the rule that must not
drift:

| Class | Content | Route |
| --- | --- | --- |
| Public | Judgments, statutes — already published | **DeepSeek V4 Flash** |
| Sensitive | Uploaded documents, matter notes, party names | **Pseudonymise, then Claude** |
| Never sent | A full client file with no legal reason to leave the device | Stays local |

**Measured 9 Aug 2026**, both keys live: DeepSeek V4 Flash on OpenRouter is
**$0.098 / $0.196 per million tokens in/out**. A verification call costs a
fraction of a paisa.

**One operational fact found the hard way**: DeepSeek V4 Flash emits **reasoning
tokens**. A call with `max_tokens: 5` returned `finish_reason: "length"` and
**empty content** — the budget went entirely to reasoning. Any caller must set a
generous `max_tokens` or it will silently receive nothing, which in a harness
would look exactly like a model that had no answer.

---

## 6 · The local GPU changes one thing, and it is not what it seems

We have an **RTX 4060 Ti, 8 GB**. **Measured today**: a full re-embed of all
616,197 chunks takes **≈ 6.3 hours on this machine's CPU** (12–19 h realistically)
— see `RETRIEVAL_ARCHITECTURE.md` §6c.

**What that unlocks is experimentation, not scale.** 8 GB will not train a large
model, and does not need to:

- **A cross-encoder reranker** (~300M params) fine-tunes comfortably in 8 GB.
- **A claim-support verifier** — the FQ-R1 model — is a sentence-pair classifier.
  DeBERTa-class, well under 8 GB, and the natural first thing to train here.
- **Embedding experiments** — late chunking and SAC — are inference, not
  training, and are now an overnight job rather than a purchase.

**What it does not unlock**: anything with "70B" in the name. That stays an API
call, and should.

---

## 7 · What I am NOT claiming

- **The information-theoretic argument in §1 is reasoning, not a measurement.**
  We have not tried to fine-tune closed-book recall and observed it fail; the
  claim rests on the compression argument and on the published weakness of
  domain-fine-tuned legal models. It is strong, and it is not an experiment.
- **The RLVR section is a plan, not a result.** Nothing has been trained. The
  abstention risk in §3 is a known failure mode of sparse rewards, stated so it
  is designed for rather than discovered.
- **§2's ordering assumes retrieval is the binding constraint.** That follows
  from success@5 = 24% against recall@20 = 44% — the 56% that never enter the
  candidate list cannot be reranked into it. If a measurement overturns that
  split, the ordering changes with it.
