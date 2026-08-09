# CURRENT PLAN — the single ordered queue

**Read this file at session start, after the mandatory set in `CLAUDE.md` §0.**
It exists because a plan held only in a todo tool does not survive compaction, a
new session, or a fresh agent. **This file does.**

Last updated **8 August 2026**. Owner: **LCC (server lane)**. RCC's plan is
`docs/RCC_MASTER_PLAN.md` and is not duplicated here.

> **The ordering rule, and it is not negotiable.** `docs/GTM_INDIA.md` §9: Gate S2
> passes **before** the ground campaign. A field campaign against 2 million
> advocates is a one-shot instrument — an advocate who finds a citation they
> cannot rely on and says so in the bar room has cost us that bar room
> permanently. **The ground game amplifies whatever is actually there.**

---

## 0 · STATE OF PLAY, in five numbers

| | |
| --- | --- |
| **Gate S2** | **FAILING.** success@5 = **24.0%** against a 0.70 floor |
| Corpus | 38,341 judgments · 616,197 embedded chunks · 192,197 citation edges (44,785 resolved) |
| Citator | **22 judgments flagged of 38,341.** 7 more are `overruled_in_part` and blocked on paragraph extraction |
| Harness | 25 queries of 30. Three metrics **NOT MEASURED** (no LLM key) |
| Reranker | q8 bge-reranker: **+6.0 pts, McNemar p = 0.210 — does not ship.** fp16 will not load, fp32 OOMs |

---

## 1 · TIME-CRITICAL — the Supreme Today account arrives tomorrow

The founder buys **one account** to test. `docs/HARVEST_ENGINE.md` §13: **day one
is measurement, not harvest.** Everything below must exist before then so day one
is not spent building scaffolding.

- [x] **Pacing engine** — `services/ingest/src/harvest/pace.ts`, AIMD, 15 tests
- [x] **Supreme Today client** — session + circuit breaker, 12 tests
- [x] **Indian Kanoon client** — metered, budget-guarded, 11 tests
- [x] **Raw archive + fetch ledger** — migration `0023`, `harvest_fetches`.
      Content-hashed, immutable, records refusals. Three constraints close the
      ways a ledger could lie
- [x] **Resumable, de-duplicated work queue** — `harvest_queue`, UNIQUE
      (source, item_key). 9 store tests observed against real Postgres
- [x] **The licensed `verified_by_source` value** — migration `0024`.
      `ecourts > public_x2 > ecourts_bulk > licensed > corpus`
- [x] **A display gate** — `licensedDisplayPermitted()`, **default false**, opens
      only on an exact `LICENSED_DISPLAY_PERMITTED=true`. A withheld headnote is
      **null, never a truncated version of theirs**
- [x] **Day-one probe** — `pnpm --filter @lawmind/ingest harvest:probe`. Refuses
      honestly without credentials and prints a completion date and total cost

**§1 IS COMPLETE.** The account can be used the day it exists.

**Day-one script, in order:** what does the account actually see · what is the
real sustained rate · how big is the overlap between our 38,341 citations and
their resolvable set · archive **one** page and build the parser against it
**offline**. Never iterate a parser against the live service — that is paying for
our own bugs.

---

## 1b · BHARAT.LAW — 2–3 accounts, founder decision 9 August 2026

The founder has decided to buy **two or three accounts**. The client is built.
**It refuses today, on purpose**, and the reason is not caution — it is that the
permission is a different shape from Supreme Today's.

- [x] **Account pool** — `services/ingest/src/harvest/bharatlaw.ts`, **30 tests**
- [x] **The consent gate** — `AUTHORISATION` is **null**, exactly like
      `court/authorisation.ts`. Every automated call refuses while it is null.
      **`CLAUDE.md` §6's rule applied to a second vendor: if the authorisation's
      terms are not in the repo, the switch stays off.**
- [x] **Benchmark and extraction are separate permissions**, never one flag.
      `extractionPermitted` is expected to stay **false permanently** —
      `BHARAT_LAW_OFFER.md` §5
- [x] **A 401/403 on ONE account halts the WHOLE POOL.** Tested by counting
      network calls, not by inspecting a flag. **This is the rule that keeps
      2–3 accounts from being ban-evasion** — answering a refusal with the next
      credential is circumventing an access control, which their AUP names
- [x] **Two ceilings, not one.** Each account carries its own credit
      entitlement (Pro = **10,000/month**, their published meter) *and* the pool
      carries a lower global daily ceiling, so **adding an account does not
      silently multiply our traffic**
- [x] **Consent overrides more accounts than it covers** → the pool refuses
      rather than quietly using the covered subset

**WHY IT IS OFF.** Supreme Today gave a **written licence**. Bharat.Law gave a
**verbal yes** — and their Evaluation Terms permit benchmarking only *"without
our prior written consent"*, which is a **consent requirement, not a ban**. One
email converts it. `FOUNDER_QUEUE.md` **FQ-BL1** holds the exact wording to send.

**ORDER OF OPERATIONS, and the first step costs nothing:**

1. **Free tier first, ₹0, no signup.** Run *Kharak Singh* and *Danamma* through
   it. **That settles curated-vs-computed before any money moves.**
2. **Send FQ-BL1.** If they will not put it in writing, that is also an answer.
3. **Then buy — monthly, never annual.** Transcribe the email into
   `AUTHORISATION` and the pool opens by itself.

**Nothing here is on the Gate S2 critical path.** §2 still outranks it.

---

## 2 · GATE S2 — everything else is downstream of this

- [ ] **Recall levers** — **REGROUPED 9 Aug 2026, because "blocked on $65" was
      wrong for half of them.** `docs/RETRIEVAL_ARCHITECTURE.md` §0.

      **Blocked on nothing but a live Postgres** (same thing the reranker run
      needs — not money, not a key):
      **citation-graph expansion**, which is *already built*
      (`services/api/src/search/graph-expand.ts`, IDF-damped, harness-wired
      behind `HARNESS_GRAPH`) and has simply **never been measured**. Measure it
      **with the reranker and without** — that file's own note says graph and
      reranker are one combination, since expansion enters at rank 16 and cannot
      move success@5 alone.

      **Blocked on the LLM key only** — these are *query-side*, so they need
      **no re-chunking, no re-embedding, no reindexing**:
      HyDE · multi-query / RAG-Fusion · query decomposition.

      **~~Blocked on ~62 GPU-hours ≈ $65~~ — STRUCK 9 Aug 2026, MEASURED.**
      `Xenova/bge-m3` fp32 on this workstation's CPU runs at **36.6 ms/chunk**,
      so all 616,197 chunks is **≈ 6.3 hours** (12–19 h realistically) — **an
      overnight run on hardware we already own.** The $65 assumed a rented GPU
      because Railway has none and nobody re-checked once a 4060 Ti existed.
      `docs/RETRIEVAL_ARCHITECTURE.md` §6c. So: late chunking ·
      summary-augmented chunking (**DRM is 95.2%**) are **blocked on nothing but
      a night** — but still run the free query-side and graph levers first.
- [ ] **Reranker at n=283** on q8, the only usable build. Needs ~334 queries to
      settle +6.0 pts
- [~] **C1 · IPC↔BNS mapping** — unblocks the five BNS queries and closes the last
      S1 criterion. Handles verified: **IPC `123456789/11091` · Evidence `4218` ·
      CrPC `4221`**.

      **Splitter built and STOPPED at an honest limit.** Measured on the real IPC
      PDF: **36 sections of roughly 511**, range 1–120, 84 gaps. What it finds is
      correct — s. 1 and s. 2 are the real ones — but the PDF text layer puts
      most headings mid-line, and the heading rule is line-anchored. **The anchor
      is what stops it firing on ordinary numbered prose, so relaxing it trades
      an incomplete corpus for a wrong one.**

      **RE-DIAGNOSED 9 Aug 2026, and the earlier diagnosis was wrong twice.**

      **The layout hypothesis is dead.** Read the PDF's own text items: every
      item sits at **x = 72.0**, one font, one size. There is no indentation, so
      position carries no signal and "headings by POSITION" cannot work. The
      line anchor was never the problem either.

      **Both real misses were vocabulary, and both are now fixed:**
      a defining section's heading opens with a **quotation mark**
      (`19. "Judge".--`) which `[A-Z]` rejected — that is most of the
      definitions chapter — and an amended section carries its **footnote marker
      before the number** (`4*[18. "India".--`) so the line does not start with
      the digit. **36 → 70 sections**, both prefixes narrow, and the
      ordinary-numbered-prose guard still passes.

      **And the denominator was wrong.** "36 of ~511" measured against a number
      that is not in the file. India Code handle `123456789/11091` serves an
      **INCOMPLETE IPC**: 58 pages running ss. 1–120B, then ss. 168–171H, then
      s. 511. **Sections 121–510 are simply absent** — page 57 is s. 120B and
      page 58 is s. 511. Every page has a text layer, so this is not an
      extraction failure; the source itself is partial. **86 distinct sections
      carry a body marker, and we now parse 70 of them.**

      **So the next move is a SOURCE, not a parser.** No regex can recover
      sections that are not in the file, and s. 302 — the one everybody checks —
      is one of them.
- [ ] Three metrics stay **NOT MEASURED** until an LLM key exists — founder-queued

---

## 3 · THE MOAT, ranked by how long a funded competitor needs to copy it

`docs/TECHNICAL_MOAT.md` §5.

- [~] **Paragraph extraction for `overruled_in_part`** — extractor built, 20
      tests, wired into the propagation. **It does NOT unblock the seven, and the
      reason is a finding rather than a gap.**

      It first found paragraphs for all seven and every one was wrong.
      `[Para 129]` is the SCR headnote's own pinpoint into the **citing**
      judgment; the overruling itself appears in a *Case Law Cited* list with
      **no paragraph attribution at all**. We were one `--apply` from recording
      *Vineeta Sharma*'s paragraph 129 as the dead paragraphs of *Danamma*.

      Two refusals now catch that, and the corpus correctly returns **7 skipped**.
      **The paragraphs are not in that region of the text.** They are either in
      the body of the citing judgment where the overruling is actually reasoned —
      which needs a different locator, not a wider window — or nowhere.

      **Their Authority Check may supply them directly, which makes this a reason
      to buy the licence rather than a reason to keep parsing.**
- [ ] **The verification record** — 12+ months for anyone to copy, because it
      cannot be retrofitted onto logs that were never kept. Every field is already
      in `citation_checks` and **nothing renders it**
- [ ] **OCR** — replace `paddleocr | tesseract`, both at the benchmark floor
      (EasyOCR 93.6 → **58.3** on real Devanagari scans). **Qwen3-VL-8B,
      Apache-2.0, 75.2, one 24 GB GPU.** Self-hosted means *the file never leaves*
- [ ] **Offline-first retrieval** — `sqlite-vec` + `op-sqlite`. Own matters, saved
      authorities, opened judgments only. **Overruled status must render "last
      checked 08:14", never silently as good law**, or offline does not ship
- [ ] **Ingest speed** — measure whether High Court uploads actually land inside
      the May 2026 24-hour direction. Unproven until measured from our own ingest

---

## 4 · STANDING CORRECTIONS OWED

- [x] `docs/COMPETITIVE.md`'s **"nobody sells a workflow"** — corrected 8 Aug.
      Most of the paragraph survives: the *incumbents* still sell databases; what
      changed is that a new entrant arrived with the workflow already in it
- [x] `docs/OCR_PIPELINE.md` — correction recorded. Its premise is wrong and
      nobody should build on it until the stack moves
- [ ] **E1.2 alert drill is NOT done and must not be ticked.** `check-alert-
      coverage.mjs` is red at **2 of 4 PD-5 triggers** and deliberately unwired
      from `ci:local` until the violations are fixed

---

## 5 · WAITING ON THE FOUNDER — see `docs/FOUNDER_QUEUE.md`

Nothing below blocks the lane. Each has a built path that refuses honestly.

**Credentials and money:** Supreme Today account · Indian Kanoon
`INDIANKANOON_API_TOKEN` (₹500 credit) · `OPENROUTER_API_KEY` · a GPU for
self-hosted OCR · one Supreme Today seat for lawful manual benchmarking.

**Ask Supreme Today before the harvest starts:** the **per-account request
ceiling** (daily, monthly, burst) — it moves total cost by **30×** and
`SUPREMETODAY_MAX_REQUESTS_PER_DAY` is a *placeholder* until the contract sets
it · **may we DISPLAY their headnotes or only hold them**, and what attribution.

**Counsel, one instruction, three questions:** SCR official headnotes on e-SCR
(free, ~34,000 judgments — s. 52(1)(q)(iv) vs *EBC v. Modak*, and an official
headnote is a **government work**) · the lay-facing explainer · OD-2's written
residency view.

**Decisions:** the free citation check (the strongest idea found — asks nobody to
switch) · the ₹5,000/yr price point that reaches our exact user · which
distribution channel first · an advocate to review 20 outputs.

---

## 6 · HOW TO PICK THE NEXT TASK

1. **Anything in §1**, while the account is imminent.
2. **Then §2.** Gate S2 gates the ground campaign, the marketing claim, *and* the
   evaluation of the Supreme Today licence itself.
3. **Then §3**, in the order written — it is already ranked by defensibility.
4. **§4 whenever a related file is open.**
5. **Never §5.** Queue it and keep going.

**And the standing rule that decides ships:** `DATA_ADVANTAGE.md` §1d — *if it
does not move the number on our own corpus, it does not ship.* Applied on 8 Aug to
reject a **free** Apache-2.0 reranker at +6.0 points and p = 0.210. A paid
dependency gets the same test, not a softer one.
