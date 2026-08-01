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
   CAPTCHA. **Never bypass it** — government system, and circumventing it is
   fragile and legally reckless. Confirmed → `verification_state = verified`,
   `verified_by_source = ecourts`. Cache permanently.
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

## Three concerns, not one enum

A citation carries **three independent answers**, from three different sources.
Folding them into a single state was wrong: **a judgment can be verified and
overruled at the same time.**

| Field | Values | Question | Source |
|---|---|---|---|
| `verification_state` | `verified` · `unverified` · `failed` | Does this authority exist? | Tiers 1–3 |
| `verified_by_source` | `corpus` · `public_x2` · `ecourts` · `none` | Who confirmed it? | whichever tier resolved |
| `overruled_status` | `none` · `set_aside` · `partly_set_aside` · `doubted` | Is it still good law? | `judgments`, step 9 |

`failed` means the check itself could not run — a tier was unreachable. It renders
identically to `unverified` (never as confirmed), but is separated so an outage
does not masquerade as a corpus gap in the metrics.

### Rendering — verified is silent, the exception is loud

**Revised 1 Aug 2026. This changes the UI only. The pipeline, the three fields,
the tiers, the fan-out, the never-cached rule and the zero thresholds are all
unchanged and all still binding.**

| Condition | Renders |
|---|---|
| `verified` · any source | **nothing** |
| `unverified` or `failed` | a visible, unmissable mark — "We could not confirm this reference" + the eCourts path |
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
   document we cannot observe a render at all. `citation_copies` lets us *notify*;
   it does not let us *measure*.
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

| State | Exported in a draft · **or copied out** | Saved to a matter only |
|---|---|---|
| `set_aside` | Push + in-app + email, immediately | In-app |
| `partly_set_aside` | Push + in-app, naming the paragraphs | In-app |
| `doubted` | In-app only — **never push** | In-app |

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
> You copied this citation on **2 March 2026**, from a search for *"parity in
> bail, co-accused"*. It showed as verified then, and it was.
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
