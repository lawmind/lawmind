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

### The five badge states are derived

| Badge | Condition |
|---|---|
| `VERIFIED` | `verified` · `corpus` |
| `VERIFIED ×2` | `verified` · `public_x2` |
| `VERIFIED BY YOU` | `verified` · `ecourts` |
| `NOT CONFIRMED` | `unverified` or `failed` |
| `LAW MOVED` | `overruled_status != none`, **whatever the verification state** |

Render rules per state are in `design/screens/IMPLEMENTATION.md` §Badge and are a
design deliverable — do not restate geometry here.

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

Any citation rendered with a `VERIFIED` badge whose live `overruled_status` is not
`none`, over total citations rendered.

**Threshold 0.0%. This is a failure of the same severity as a hallucination** and
escalates the same way: immediately, blocking release. A hallucinated citation
tells an advocate something false about a case that does not exist; a stale
overruled badge tells them something false about a case that does, which is
harder to catch because everything else about the citation checks out.

Harness assertion: for every fixture with `overruled_status != none`, render each
surface and assert the badge is `LAW MOVED`. The `set_aside` fixture must
additionally assert add-to-matter is disabled.

## When the law moves — what the advocate is told

Notification severity follows the three overruled states, matching how each state
renders (§9.3): `set_aside` replaces the header in danger red, `partly_set_aside`
carries a caution band, `doubted` shows no band at all. A notification that
shouted equally for all three would train advocates to ignore it.

| State | Exported in a draft | Saved to a matter only |
|---|---|---|
| `set_aside` | Push + in-app + email, immediately | In-app |
| `partly_set_aside` | Push + in-app, naming the paragraphs | In-app |
| `doubted` | In-app only — **never push** | In-app |

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
