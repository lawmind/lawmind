# CITATION HARNESS — BINDING SPEC

The file that decides whether Lawmind survives. Read before touching retrieval,
prompts, verification or render. Spec, not guidance.

## Why

An advocate who files a document containing a case that does not exist is
humiliated in open court. They do not return, and they tell their bar
association. A single occurrence is an extinction event for a product whose whole
proposition is trustworthy citations.

In late 2024 an ITAT order cited four judgments that did not exist and was
recalled within a week. That is the failure mode. Not hypothetical.

## The mechanism

A model cannot be instructed into never hallucinating. The guarantee is
structural.

1. **Retrieve first.** Hybrid search returns chunks, each carrying `judgment_id`.
2. **Hand the model IDs.** Prompt contains chunk text AND judgment IDs. The model
   may reference judgments only by IDs present in context.
3. **Model returns structured references** — judgment IDs plus the claim each
   supports. Never prose citations.
4. **Tier 1 — internal corpus.** Resolve each ID against `judgments`.
   Resolved → `verification_state = verified`, `verified_by_source = corpus`.
5. **Tier 2 — independent cross-reference.** For anything unresolved or
   low-confidence, query IndianKanoon and cross-check against the AWS S3 open
   judgment datasets. Match on citation first, then fuzzy title with a recorded
   similarity score. **Both agree** → `verification_state = verified`,
   `verified_by_source = public_x2`. Cache permanently.
6. **Tier 3 — human confirmation via eCourts.** Where Tiers 1 and 2 disagree or
   both miss, open the eCourts search pre-filled and let the advocate solve the
   CAPTCHA. Confirmed → `verification_state = verified`,
   `verified_by_source = ecourts`. Cache permanently.

   > **This stays true after the 8 Aug 2026 rule change, and the reason is not
   > legal — it is evidential.** `CLAUDE.md` §6 now permits bypassing the CAPTCHA
   > because the registrar's grant expressly allows it, but that permission is
   > scoped to **bulk cause-list harvesting** in `court/ecourts.ts`. Tier 3 is a
   > different act: `verified_by_source = ecourts` means **a named human
   > personally vouched for this citation**, which is why it caches permanently
   > and why it is the tier we fall back to when the automated ones disagree. If
   > a scraper could produce that value, the strongest guarantee in the product
   > would silently degrade to "a bot said so" — and it would still be spelled
   > `ecourts` in the database. `citations/verify.ts` therefore holds no HTTP
   > client and a test asserts it.
   >
   > **What bulk resolution writes instead: `verified_by_source =
   > 'ecourts_bulk'`** (migration `0022`, 8 Aug 2026). Same door, different act,
   > different weight. Strength order, strongest first:
   >
   > | `ecourts` | `public_x2` | `ecourts_bulk` | `corpus` |
   > | --------- | ----------- | -------------- | -------- |
   > | a human vouched | two independent sources agreed | the registry answered | we hold it |
   >
   > `ecourts_bulk` ranks below `public_x2` because independence is what catches
   > a systematic error at the source; one authoritative source answering
   > cannot. **A row may be upgraded and never downgraded**, and a bulk pass may
   > never overwrite an `ecourts` row — `citations/source-strength.ts`.

7. **Tier 4 — say so plainly.** If no tier confirms, render an explicit
   `unverified` state: we found this reference but could not confirm it exists.
   **Never silently drop it. Never present it as confirmed.**
8. **Render from the database row**, never from model output. Title, citation,
   court, date come from the resolved row — not from what the model typed.
9. **Check whether the law moved.** Independently of steps 4–7, read
   `judgments.overruled_status`. This is a different question answered by a
   different source, and it runs even when verification succeeded at Tier 1.

Step 8 is most often skipped, and skipping it reintroduces the whole problem: a
model can reference a real ID and still mistype the case name beside it.

## Exact citation lookup is a different mechanism from Tiers 1–4 — binding

**When an advocate types a citation directly** (`cite:"(1994) 3 SCC 1"`,
`POST /search`), no model is in the loop at all. `search/qlang/` parses the
query deterministically and `search/structured.ts` resolves it against
`judgments` by exact, normalised match. This is the exact-citation resolver
task 001 (11 Aug 2026) closed as a P0: **structure decides, semantics fills,
never blended** — a citation-shaped query must never fall through to semantic
search on a failed exact lookup, because a fuzzy match scoring above an exact
one looks like a good result and is a wrong answer.

**Three outcomes, not two.** A citation resolves to exactly one judgment
(`matched`), to none (`no_match`, rendered as an explicit not-found, never as
zero silently blended into a broader search), or — **found live in the
corpus, not hypothetical** — to **more than one** judgment
(`ambiguous`, added 11 Aug 2026). `cite:"2020 INSC 189"` resolves to three
distinct real Supreme Court judgments today (same date, same court, different
parties — a genuine source-numbering collision, not a corpus defect). All
three outcomes carry every real matching row; nothing is ever invented to
produce a single answer, and nothing is ever silently dropped to hide that
more than one exists.

**Ambiguity is scoped to a bare `cite:` term**, not to any field returning
more than one row. `judge:"Chandrachud"` returning hundreds of judgments is
ordinary filtering, not ambiguity — only a citation is supposed to identify
one judgment by construction, so only its failure to do so is a citation-safety
event. `services/api/src/search/structured.ts` — `isBareCitationTerm`.

## Three concerns, not one enum

A citation carries **three independent answers**, from three different sources.
Folding them into a single state was wrong: **a judgment can be verified and
overruled at the same time.**

| Field                | Values                                                | Question                   | Source                  |
| -------------------- | ----------------------------------------------------- | -------------------------- | ----------------------- |
| `verification_state` | `verified` · `unverified` · `failed`                  | Does this authority exist? | Tiers 1–3               |
| `verified_by_source` | `corpus` · `public_x2` · `ecourts` · `ecourts_bulk` · `none` | Who confirmed it?   | whichever tier resolved |
| `overruled_status`   | `none` · `set_aside` · `partly_set_aside` · `doubted` | Is it still good law?      | `judgments`, step 9     |

`failed` means the check itself could not run — a tier was unreachable. It renders
identically to `unverified` (never as confirmed), but is separated so an outage
does not masquerade as a corpus gap in the metrics.

### Rendering — verified is silent, the exception is loud

**Revised 1 Aug 2026. This changes the UI only. The pipeline, the three fields,
the tiers, the fan-out, the never-cached rule and the zero thresholds are all
unchanged and all still binding.**

| Condition                  | Renders                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `verified` · any source    | **nothing**                                                                                      |
| `unverified` or `failed`   | a visible, unmissable mark — "We could not confirm this reference" + the eCourts path            |
| `overruled_status != none` | the existing `LAW MOVED` treatment and its three sub-states, **whatever the verification state** |

**Verification is the expected state; decorating it is noise.** On a typical
five-result list that is zero marks instead of five. Badges on every result made
the product look defensive about the one thing it is supposed to be confident
about.

**Silence means "we verified this and are not decorating it." It never means "we
removed something without saying so."** An unverified citation is always shown and
always marked. **Silent-drop rate stays at 0.0%** and `citation_checks` still
writes a row per citation per surface — the measurement is unchanged, only the
pixels are.

### Where verification stays visible — three places, all pull not push

1. **Draft footer** — "4 of 4 citations verified", one line, in-app only.
2. **On tap** — tapping a citation shows how it was verified and by which source.
   This is what `verified_by_source` now drives; it no longer drives a badge
   qualifier.
3. **Admin citation monitor** — unchanged, full state visibility.

Render rules for the two states that still draw are in
`design/screens/IMPLEMENTATION.md` §Badge — geometry unchanged for those two.
**The three verified variants of the stamp are no longer rendered anywhere in the
app.** They remain in the design files; see `design/SCREENS.md` for the divergence.

An unverified citation may be shown. It may never be shown as confirmed, and it
may never be silently removed. `set_aside` additionally **disables add-to-matter**
— the only case where Lawmind refuses to let an authority be used.

## The fourth concern: can this judgment be cited at all — binding, added 11 Aug 2026

**Task 002.** Added after the High Court ingest (40,980 rows, S1) proved the
corpus can hold a judgment with **no neutral citation and no reporter
citation at all** — every Supreme Court judgment held one for the life of the
project, so nothing in the product had ever needed to ask this question.
RCC's audit (bus 0019, reproduced by rendering the actual client, not by
reading JSX): such a judgment currently renders **totally unmarked** — a
verified, good-law Supreme Court authority and a Patna High Court order we
hold no citation for are visually identical. **In this product unmarked
means verified-and-fine**, so the product was asserting "safe to file" about
something that cannot be filed, through the one channel — silence — that the
harness does not watch.

**Citability is a fourth, independent question, not a variant of any of the
three above.** A judgment can be verified (Tier 1 — we hold the text, which
is true) and simultaneously uncitable (we hold no printed citation to write
in a petition). Verification asks *"does this authority exist"*; citability
asks a different question a court asks separately: *"what do I write to
refer to it."* Folding this into `verification_state` would make the same
mistake `overruled_status` already corrected once.

**Definition, derived, never stored:**

> `citable = false` **iff** `neutralCitation === null AND
> reporterCitations.length === 0`.

No new column, no new wire field. `neutral_citation` and `reporter_citations`
are already correct and already nullable/empty-capable server-side on every
row (`SCHEMA_TRUTH.md` §judgments) and already carried on every payload that
carries a citation (`API_CONTRACTS.md` §Search). This is the same
architecture the other three concerns already use: **the server sends the
raw truthful fields, the client derives the render state — never the
reverse.** `citation/renderState.ts` gains a fourth input and a fourth output
branch; it does not gain a new field to fetch.

### Render rule — an unmissable mark, independent of the other three

| Condition | Renders |
| --- | --- |
| `citable = false` | an unmissable mark — **"No citation on file — cannot be referenced in a filing"** |

This mark is **additive to, and independent of,** the existing three-row
table above: a citation-less judgment that is also `unverified` shows both
marks; one that is also `overruled_status != none` shows both. Citability is
checked whether or not the other three pass, exactly as `overruled_status`
already is. It does **not** replace the silent-when-verified rule for the
three existing concerns — a citable, verified, good-law judgment still
renders nothing, unchanged.

### Severity — warn, not block. Decided directly by the founder, 11 Aug 2026

The alternative considered and rejected: treat it like `set_aside` and
**disable add-to-matter.** Rejected because the reason is different — a
`set_aside` judgment is bad law; a citation-less judgment may be perfectly
good law we simply cannot yet write a pin cite for, and an advocate has
legitimate uses for it (background reading, argument context, a case whose
facts and reasoning matter even before its citation is confirmed). **Task
002 §9 of the LCC autonomous-execution charter states the same principle
directly: "absence of citation ≠ absence of legal evidence."**

Binding as a result:

- **Add-to-matter stays enabled.** The mark above renders; nothing is
  disabled. This is the one place citability differs from `set_aside`'s
  treatment, and the difference is deliberate, not an oversight.
- **`PrecedentPanel` (draft suggestions) stays enabled**, carrying the same
  mark inline. An uncitable judgment is not excluded from suggestions the way
  `set_aside` judgments are — RCC's audit flagged the current unmarked
  offering as the danger, not the offering itself.
- The judgment **stays searchable** and **stays in the corpus** — task 002 §9:
  *"keep the judgment searchable... preserve its primary-source evidence...
  preserve case number, parties, court, date, source URL and paragraph
  information where available."* Citability changes what is rendered, never
  what is retrieved.

### Copy — never a fabricated citation, never the literal string `null`

`DOMAIN_TRUTH.md` §Citation formats, quoted rather than paraphrased: **"Never
construct a citation string by pattern — render only what is stored."** This
already settles what copy must do; it is not a new rule invented for task
002, only the first case that makes it visible. Where `neutralCitation` is
null, the citation segment is **omitted, not fabricated and not rendered as
the string `null`.** A copy of a citation-less judgment carries the case
title (and court/date, where the copy surface already includes them) and
nothing purporting to be a citation. `citation_copies` still logs the copy
— the mark on screen told the advocate what they were copying; the record
that lets Lawmind warn them later is unaffected.

### What this is not

Not a new verification tier, not a new `citation_checks` value, not a
database migration. It is a render rule keyed on two fields the server has
always sent correctly. The defect was entirely client-side: `contract.ts`
declared `neutralCitation: string` non-nullable on `SearchResult` ·
`JudgmentDetail` · `PointInTimeAuthority` · `Treatment` · `GraphNode` ·
`CounterAuthority`, so the TypeScript compiler could not have caught what
`citationRender` never checked. Fixing those five declarations to
`string | null` is expected to turn every uninstrumented interpolation site
into a compile error — RCC's own words, "the compile errors ARE the
inventory" — and that is the correct outcome, not a regression to work
around.

## Overruled status is never cached — binding

**Verification is permanent. Overruledness is not.** A case that existed still
exists, so a confirmed verification can be cached forever. Whether that case is
still good law changes the moment a later judgment moves it — so caching it
produces a badge asserting confidence the system no longer has.

The failure this prevents, stated concretely because it is the worst output this
product can produce:

> An advocate searches in January, finds a case, verified, not overruled, and
> saves it to a matter. In February the Supreme Court overrules it. In March they
> draft a bail application citing it. With a cached overruled status that draft
> carries a **VERIFIED** badge on overruled law — worse than an unverified
> citation, because the badge asserts a confidence we do not have, and the
> document is filed in open court.

Three binding rules:

1. **`overruled_status` is read live at render time, on every surface** — search
   results, judgment detail, briefing authorities, draft citation stamps, matter
   authority lists, exports. It is **never** served from `verification_cache`,
   never denormalised onto `citation_checks`, and never carried in a client cache
   across sessions. Offline surfaces render the status they last read **with its
   as-of date shown**; they never present a stale status as current.
2. **A background re-check runs** for every judgment referenced by an active
   matter or an exported draft — see `API_CONTRACTS.md` §Overruled re-check.
3. **A flip triggers the citation fan-out** — the same operation as upholding a
   dispute, not a second one.

### Metric — stale-overruled rate. Threshold zero.

Any citation rendered **without the `LAW MOVED` treatment** whose live
`overruled_status` is not `none`, over total citations rendered.

> Restated 1 Aug 2026. It previously read "rendered with a `VERIFIED` badge".
> Under the silent-verified UI there is no such badge, and the metric had to be
> re-keyed on the **absence of the exception** rather than the presence of a
> reassurance. The SQL below was already written this way — it keys on
> `overruled_status_shown`, not on a badge — so the measurement did not change.

**Threshold 0.0%. This is a failure of the same severity as a hallucination** and
escalates the same way: immediately, blocking release. A hallucinated citation
tells an advocate something false about a case that does not exist; a stale
overruled state tells them something false about a case that does, which is
harder to catch because everything else about the citation checks out.

**The silent UI raises the stakes on this metric, not lowers them.** When every
verified citation carried a badge, a missing badge was itself a signal. Now a
clean citation and a citation whose `LAW MOVED` treatment failed to render look
**identical on screen**. The metric is the only thing standing between those two
cases, so it cannot be allowed to drift.

Harness assertions:

- every fixture with `overruled_status != none` renders `LAW MOVED` on **every**
  surface; the `set_aside` fixture additionally asserts add-to-matter is disabled;
- every `unverified` and `failed` fixture renders the unmissable mark;
- every `verified` fixture with `overruled_status = none` renders **no mark at
  all** — assert the absence, so a regression that reintroduces badges is caught.

### How stale-overruled is measured

A zero threshold nobody can compute is decoration. The mechanism is deliberately
the cheapest thing that detects the failure, not the most complete.

**No new event stream.** `citation_checks` already writes one row per citation per
surface, so the render is already recorded — it needs two columns, not a pipeline:
`overruled_status_shown` (what the server sent) and `surface`. Write volume does
not change. `judgments.overruled_status_changed_at` supplies the other half.

Detection is then a query, not a service:

```sql
SELECT count(*) FILTER (WHERE stale)::numeric / nullif(count(*),0) AS stale_rate
FROM (
  SELECT cc.shown_to_user
     AND cc.verification_state = 'verified'
     AND cc.overruled_status_shown = 'none'
     AND j.overruled_status <> 'none'
     AND j.overruled_status_changed_at <= cc.created_at   -- already moved when we rendered
       AS stale
  FROM citation_checks cc
  JOIN judgments j ON j.id = cc.judgment_id_matched
  WHERE cc.shown_to_user
) t;
```

The `overruled_status_changed_at <= created_at` clause is the whole point: it
separates **a badge that was wrong when we drew it** from one the world
invalidated afterwards. Only the first is staleness. The second is the world
moving, which the fan-out handles, and counting it would make the metric
unfixable and therefore ignored.

Runs on every harness execution and continuously in the Citation monitor.

### What this mechanism cannot catch

Stated plainly, because a metric implying total coverage is worse than one with
known blind spots.

1. **Offline renders.** The client renders cached matters and briefings with no
   server round-trip, so no `citation_checks` row is written and nothing is
   measured. The as-of date rule bounds the harm; it does not measure it. This is
   the largest blind spot and it is structural — measuring it would require
   client telemetry the local-first design deliberately avoids.
2. **Anything after a copy leaves the app.** Once a citation is in someone's Word
   document we cannot observe a render at all. `citation_copies` lets us _notify_;
   it does not let us _measure_.
3. **Long-lived screens.** The row records when the server sent the payload, not
   when the pixel was painted. A search results screen left open for an hour shows
   a badge an hour older than its row claims.
4. **A corpus that never learned.** If `judgments.overruled_status` is `none`
   because ingestion never ingested the overruling judgment, both sides of the
   comparison agree and this metric reads **0.0% while advocates see stale
   badges.** This measures render-versus-corpus consistency, **not truth.** Corpus
   completeness is a different failure with different owners — disputed citations
   (an advocate tells us) and corpus coverage (`ADMIN_SURFACE.md` §6). Do not let
   a green stale-overruled rate be read as evidence the corpus is current.
5. **It is retrospective.** This detects after the fact and gates releases; it
   does not prevent a bad render at runtime. The runtime guard is the separate
   contract rule that a citation payload missing its three fields renders "not
   confirmed" and reports itself.

## Citations are locked in editing — binding (PD-7)

**A hand-edited citation breaks the verification chain.** The badge asserts that a
specific `judgment_id` was resolved and checked. If free text can overwrite the
citation string beside it, the badge now asserts something we never checked — which
is the hallucination failure arriving by a different door, and harder to catch
because the citation was genuinely verified once.

**A citation may only be changed through the picker, which re-verifies.**
Free text may never overwrite a verified citation.

### This is enforced by the API, not the client

The client draws a lock glyph beside the stamp and makes citation spans
non-editable. **That is presentation, and presentation is not enforcement** — a
replayed request, a stale build or a modified client bypasses it entirely.

`PATCH /documents/:id` accepts **paragraph prose only**:

1. The server holds the authoritative citation set for a document in
   `citation_checks` (`document_id`), each bound to a `judgment_id`.
2. On every write, the server re-extracts citation spans from the submitted body
   and compares them against that set. **Any divergence — an altered citation
   string, a removed span, an added one — is rejected `422`.** The document is not
   partially saved.
3. Changing an authority goes through `POST /documents/:id/citations`, which takes
   a `judgmentId` and **runs the verification tiers again**, never a citation
   string.
4. Removal goes through the authority list, not the keyboard.

The rule to hold in mind while implementing: **the body a client submits is
untrusted prose; the citations are server state.** They meet only at render.

## When the law moves — what the advocate is told

Notification severity follows the three overruled states, matching how each state
renders (§9.3): `set_aside` replaces the header in danger red, `partly_set_aside`
carries a caution band, `doubted` shows no band at all. A notification that
shouted equally for all three would train advocates to ignore it.

| State              | Exported in a draft · **or copied out** | Saved to a matter only |
| ------------------ | --------------------------------------- | ---------------------- |
| `set_aside`        | Push + in-app + email, immediately      | In-app                 |
| `partly_set_aside` | Push + in-app, naming the paragraphs    | In-app                 |
| `doubted`          | In-app only — **never push**            | In-app                 |

**A copy is treated exactly as an export.** In both cases the citation has left
the app and we cannot know where it went — that identical problem gets identical
severity. It is not the lesser case; it is the worse one, because with a draft we
can at least name the document.

`doubted` is still binding law. Waking someone at night for it would be crying
wolf, and the app deliberately shows it no band.

**Push — `set_aside`, already exported**

> **A case in your filed draft has been overruled**
> Ramesh v. State of Haryana was set aside on 14 March. You cited it in a bail
> application on 2 March.

**In-app — `set_aside`, already exported**

> ### The law moved on a case you cited
>
> On **14 March 2026** the Supreme Court set aside
> **Ramesh v. State of Haryana (2019) 4 SCC 221**.
>
> You cited it in **Bail application — State v. Yadav**, which you exported on
> **2 March 2026**.
>
> When you cited it, that judgment was good law and our record showed it as
> verified. It is not good law now. We are telling you because that document has
> already left this app, and we cannot know whether it has been filed.
>
> **What replaced it —** Suresh v. State of Punjab (2026) 2 SCC 88
> [Read the holding]
>
> [Open the draft] [See what changed]
>
> We re-check every authority in your matters and exported drafts daily.

**In-app — `partly_set_aside`, already exported**

> ### Part of a case you cited has been set aside
>
> On **14 March 2026** the Supreme Court set aside **paragraphs 14–19** of
> **Ramesh v. State of Haryana (2019) 4 SCC 221**. The rest of the judgment
> stands.
>
> You cited it in **Bail application — State v. Yadav**, exported **2 March 2026**.
>
> **What still stands —** the finding on parity at paragraph 22, which is what
> your draft relies on. [See the paragraphs that fell]
>
> [Open the draft]

**Push — `set_aside`, copied out of the app**

> **A case you copied has been overruled**
> Ramesh v. State of Haryana was set aside on 14 March. You copied it on 2 March.

**In-app — `set_aside`, copied out of the app**

The one variant where we cannot name a document, so the copy says so rather than
implying we know more than we do.

> ### The law moved on a case you copied
>
> On **14 March 2026** the Supreme Court set aside
> **Ramesh v. State of Haryana (2019) 4 SCC 221**.
>
> You copied this citation on **2 March 2026**, from a search for _"parity in
> bail, co-accused"_. It showed as verified then, and it was.
>
> We do not know where it went — that is the point of a copy. If it went into a
> document you have filed or are about to file, it needs replacing.
>
> **What replaced it —** Suresh v. State of Punjab (2026) 2 SCC 88
> [Read the holding] · [Copy the new citation]
>
> We check every authority you copy or save, every day.

Naming the search that produced the copy is the only handle we have for jogging
memory — an advocate will not recall "2 March" but will recall what they were
working on. Never guess beyond that: do not name a matter unless `matter_id` was
recorded on the copy, and never say "your bail application" when we only know a
citation left the app.

**In-app — `doubted`, saved only**

> ### A case in your matter has been doubted
>
> **Ramesh v. State of Haryana (2019) 4 SCC 221** was doubted by a coordinate
> bench on 14 March 2026. It remains binding, and you can still rely on it — but
> expect it to be contested. [Read the referring judgment]

Copy rules, binding: never imply the advocate erred — the law moved, they did not
misread it. Never hedge the fact, and never soften it to protect us: if we showed
a verified badge and the law has since moved, say so plainly. Always name what
replaced it, because the advocate's next action is finding the substitute. Never
send a notification with no action attached.

## Startup preflight — fail closed, never boot degraded — binding, added 11 Aug 2026

Every other degradation path in the API is deliberately fail-*open*: if the
embedding model never loads, `/search` keeps serving lexical-only rather than
refusing requests (`services/api/src/index.ts`'s own comment explains why that
specific gap is safe to survive — search degrades, it does not lie). Citation
correctness is the one thing that must not survive silently broken, because an
advocate cannot tell a `cite:` query that quietly stopped matching from one
that correctly found nothing.

`services/api/src/preflight.ts` runs on every boot, before `serve()`, and
`process.exit(1)`s if any check fails:

1. **`qlang` module sanity** — `parse()` on a canonical `cite:` query must
   return a single citation term without throwing. Catches a parser
   regression before it reaches `isBareCitationTerm` (the ambiguity gate).
2. **Required tables** — `judgments`, `citation_checks`.
3. **Required `judgments` columns** — `id`, `case_title`, `full_text`,
   `neutral_citation`, `reporter_citations`, `overruled_status`. Real stored
   columns only: `verificationState`/`verifiedBySource` in the judgment-detail
   response are literal constants (`judgments/route.ts`) — a corpus judgment
   is `verified`/`corpus` by construction — not columns, and do not belong on
   this list.
4. **The citation-lookup index**, `judgments_neutral_citation_key`
   (`packages/db/drizzle/0026_structured_search.sql`).
5. **JS/SQL citation-key parity** — the load-bearing check. `citationLookupKey()`
   (`search/query-shape.ts`) and the index's SQL expression implement the same
   normalisation rule twice, by design, in two languages — the file's own
   comment calls a second implementation "exactly the drift `CLAUDE.md`
   forbids." The preflight runs both on the same probe string and asserts they
   agree. Table, columns and index can all be present while these two drift
   silently; nothing else here would catch it.

Schema- and expression-level, not data-dependent — passes against an empty
corpus, so every boot runs it, not just a seeded fixture once.

**The first draft of check 3 guessed `verification_state`/`verified_by_source`
as `judgments` columns and was wrong** — caught by running it against the live
production schema before shipping, not by review. Had it shipped, the API
would have hard-failed every future boot. The lesson stays here rather than
only in the commit: verify a schema assumption against the real database
before writing an assertion that refuses to boot on it.

## The harness — run before any gate

Fixed set, 30 queries with known-correct answers: criminal (10), civil (10),
BNS/BNSS mapping (5), Hindi (5).

Plus the **adversarial set** — `docs/DATASETS.md`. Drawn from real errors found
in public legal instruction datasets. Correct behaviour on every one is refusal
or an honest unverified state.

Metrics:

- **Hallucination rate** — references shown as verified that no tier confirms ÷
  total references. **Threshold 0.0%. Any failure blocks the gate.**
- **Silent-drop rate** — references removed without an unverified state shown.
  **Threshold 0.0%.**
- **Retrieval precision@5** — ≥ 0.7.
- **Overruled leakage** — a judgment with `overruled_status != none` rendered
  without the `LAW MOVED` badge. Threshold 0.
- **Adversarial pass rate** — 100%. Reproducing any known-bad output is a fail.

## Gate rule

Any change to retrieval, prompts, verification or render runs the harness and
reports every number. A regression blocks the change regardless of green tests.
Gate S2 is a hard stop on this harness.

## What the advocate on retainer checks

Numbers are necessary, not sufficient. The advocate reviews 20 outputs per gate
for a failure the harness cannot see: citations that resolve, are real, and are
simply wrong for the question. Only a lawyer catches relevance.
