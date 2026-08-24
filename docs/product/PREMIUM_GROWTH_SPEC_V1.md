# PREMIUM_GROWTH_SPEC_V1 — hypotheses, ranked. No price set. Nothing built.

**NEW3, 23 Aug 2026.** Builds directly on `PREMIUM_GROWTH_RESEARCH_2026.md`
(same directory) — read that first; this document does not re-derive its
evidence. Per the founder's own instruction: several hypotheses, ranked,
compared against alternatives, **not decided here**. No production price
changes. No screens built from this document without a separate go-ahead —
this is the design pass P2/P3/P4/P6/P7 asked for, not P8's implementation.

**UPDATE, same day — LCC built the server side of this spec, flag-gated OFF
(bus 1051/1053).** `GET /me/entitlements` (capability list, never a `PRO`
boolean), `GET /matters/:id/premium-preview`, `POST/GET /premium/jobs`,
`activation_events`, `experiment_assignments`/`experiment_exposures` all
exist now behind `platform_config` flags defaulting OFF — nothing here is
live. LCC also found a real error in this document's original §2A/§6: the
"supporting/contrary" authority split was classified `cheap`, and the schema
has no stance column to compute it from. Corrected in place below rather
than left wrong with a note — see §2A and §6 for what changed and why. **P8
(the 10-matter hands-on walkthrough) is now unblocked**: the preview
endpoint exists to build a client against instead of guessing one.

---

## 0. The principle this whole document is bounded by

Restated because every section below is tested against it, not just the
opening one:

**Never paywall, blur, or use as scarcity bait**: verified adverse treatment,
whether an authority's scope is unresolved, primary judgment/statute text,
basic citation/title/statute search, ordinary result pagination, a court date
already shown elsewhere in the product, a legal safety warning, or an
error/degraded-state warning. `CLAUDE.md` §"UI: VERIFIED IS SILENT" and the
LAW MOVED mark are not decorations available for a growth experiment to
withhold — the app-wide rule that `overruled_status` renders live, everywhere,
in all three states, applies to every screen this document proposes with zero
exception.

**Charge for**: automation, synthesis, continuous monitoring, workflow depth,
time saved, collaboration, premium computation. Never for trust.

**New from the founder's orchestrator corrections, binding on every hypothesis
below:**
- A citation edge (`A CITES B`) is not a treatment verdict. Nothing in this
  document may present "resolver coverage went up" as "currentness coverage
  went up" — the two are `docs/CURRENT_PLAN.md`'s NEW1/LCC work, unrelated to
  premium framing, and conflating them here would be exactly the mistake the
  correction names.
- Any premium feature that would send matter facts, client names, notes,
  documents or briefing content to an external model needs an explicit
  provider-routing decision **first** — see §7. None of the hypotheses below
  are cleared to call a real LLM on real matter data yet.
- Preview cost must be measured, not assumed cheap — see §6.
- Every hypothesis needs an experiment/kill-switch shape before it ships, not
  after — see §8.

---

## 1. Structure hypotheses — compared, not decided

**Do not default to three subscription tiers because Tinder has three.**
`PREMIUM_GROWTH_RESEARCH_2026.md`'s RevenueCat section notes fewer plan
choices can reduce decision fatigue; LawMind already has a reason of its own
to be skeptical of a wide tier ladder — `SubscriptionScreen.tsx` already
carries three real, PD-13-settled tier names (**Practice / Chamber /
Expert**, ₹799 / ₹1,999 / ₹3,499, no purchase button wired yet) plus a
non-priced **Firm** row. Any structure hypothesis below has to either fit
inside that existing, already-designed shape or name explicitly why it
doesn't.

### Hypothesis A — Free / Pro / à-la-carte (three lanes, one subscription tier)

Collapses Practice/Chamber/Expert's *volume* distinction into one **Pro**
subscription (automation, synthesis, monitoring, workflow depth — the
`CLAUDE.md` "charge for" list) sitting on top of a fully-capable free research
core, plus **one** à-la-carte product (a single generated-pack credit) for
someone not ready to subscribe. Firm/Enterprise unchanged (invoiced, no
in-app price, already the settled PD-13/OD-3 pattern).

- **For**: matches RevenueCat's fewer-choices evidence; a single Pro tier is
  easier to explain honestly in one paywall screen (Apple 3.1.2(c)); the
  à-la-carte credit is the Tinder/Bumble-analog high-intent purchase for a
  user who tries LawMind for exactly one matter and needs one hearing pack,
  never a subscription.
- **Against**: collapses the three ₹-figures already live in
  `SubscriptionScreen.tsx` and PD-13 — reopening a settled tier structure is
  not this document's call (`docs/OPEN_DECISIONS.md`'s own rule) and would
  need a founder decision, not a NEW3 default.

### Hypothesis B — Keep Practice/Chamber/Expert as-is, add à-la-carte on top

Leaves PD-13's three tiers exactly as named and priced (however they end up
differentiated — that differentiation itself is not decided in this
document), and adds the same single à-la-carte Hearing Pack credit as a fourth,
orthogonal product. No PD reopened.

- **For**: zero conflict with a settled decision; the credit product is
  additive, matching the "additive, documented, provisional" pattern this
  repo already uses elsewhere for genuinely new capability.
- **Against**: does not resolve what actually differentiates Practice from
  Chamber from Expert today — `SubscriptionScreen.tsx`'s own copy ("starting
  out" / "full practice" / "heavy volume") suggests a *usage-volume* axis
  (matters, generations/month) rather than a *feature* axis, which is a
  separate, still-open product question this document does not answer.

### Hypothesis C — Team/Chambers as a real tier now

Rejected for this round, matching the founder's own instruction: **"DEFER
unless evidence says launch needs it."** No evidence gathered this session
says it does — Firm/Enterprise already exist as an unpriced, invoiced,
"talk to us" row, which is the correct shape until a specific chamber asks for
seat-based billing.

**Recommendation, held loosely: Hypothesis B.** It changes nothing settled,
adds exactly one new product (the credit), and defers the harder
Practice/Chamber/Expert differentiation question to whoever actually owns
that PD rather than deciding it by omission inside a growth-mechanics
document.

---

## 2. The "Likes You" analog — four candidates, real data only

**Rule for all four**: a locked/blurred element must correspond to a REAL
generated or computed value — never a generic placeholder rectangle. Where
the underlying computation is expensive (an LLM call), the free preview shows
only what is already cheap/deterministic (see §6); nothing here spends model
cost to produce a teaser for a free user.

### A — After saving authorities to a matter

**CORRECTED 23 Aug 2026, LCC (bus 1051/1053) — the original mock below was
wrong, not just unbuilt.** It showed "4 supporting authorities / 2 contrary
positions" as a free count. Checked against the live schema:
`matter_authorities` is `(id, matter_id, judgment_id, added_by_user_id,
citation_check_id, added_at, removed_at, removed_by_user_id)` — **no stance
column exists anywhere in the database.** Nothing records whether a saved
authority helps or hurts a matter. Splitting the count by stance is not a row
count; it is exactly the synthesis this hypothesis already places behind Pro
two lines down — the mock had accidentally given away the paid half for
free. `GET /matters/:id/premium-preview` (now built, flag-gated OFF) returns
one `authorityCount` total and `stanceNotComputed: true` instead:

```
┌─────────────────────────────────────────────┐
│  MATTER: State v. Sharma — Sessions Case 44  │
│                                               │
│  6 authorities saved                         │ ← FREE, real (authorityCount)
│  1 unresolved treatment scope                │
│                                               │
│  ⚠ 2016 INSC 88 — LAW MOVED, set aside       │ ← FREE, always, unmissable
│     Cite the replacement instead              │
│                                               │
│  ┌─────────────────────────────────────────┐│
│  │ See which help and which hurt             ││ ← Pro
│  │ Full argument map: why each authority      ││
│  │ helps or hurts, and what to cite           ││
│  │ instead of the set-aside one               ││
│  │              [ Unlock with Pro ]          ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

The total count and the LAW MOVED banner are **already-computed, already-free**
facts — `matter_authorities` row count and the live `overruled_status` read,
both confirmed on the wire by LCC's preview endpoint. The supporting/contrary
*split* moves fully into the Pro-gated synthesis alongside "why" — it was never
cheap, and showing it free would have been the exact manufactured-precision §0
forbids. Either a stance column gets designed and populated later (a product
decision, not made here) or the split stays paid indefinitely.

### B — Upcoming hearing

```
┌─────────────────────────────────────────────┐
│  Hearing: 3 Sept 2026, District Court        │ ← FREE (already shown elsewhere)
│                                               │
│  Your hearing pack is ready to generate:     │
│  6 authorities · 4 issues · 3 counterargs    │
│  2 procedural dates need attention           │ ← FREE (deterministic counts)
│                                               │
│  ┌─────────────────────────────────────────┐│
│  │        [ Generate full prep pack ]        ││ ← Pro / à-la-carte credit
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### C — Matter change detected

```
"3 changes since you last opened this matter."      ← FREE — this is state
                                                        the advocate could see
                                                        by opening the matter
                                                        manually; showing the
                                                        count costs nothing
                                                        and reveals nothing new
[ Turn on automatic monitoring + push — Pro ]        ← Pro is the AUTOMATION
                                                        (proactive, no manual
                                                        check needed), never
                                                        the fact itself
```

### D — Deep research, multiple authorities saved

```
"You've saved 5 authorities to this matter.
 Build an argument map from them?"
              [ Preview — Pro ]
```

**Ranking**: A and C are the strongest — both gate pure synthesis/automation
over already-free data, cleanest fit to §0. B is good but depends on the
Hearing Pack product existing (§7 of the research doc — a-la-carte). D is the
weakest as a *standalone* trigger (it's really a rephrasing of A) but useful
as a secondary in-context nudge rather than a distinct paywall moment.

---

## 3. One free premium sample — hypothesis, not a decision

**Test, do not assume**: a user's **first** Matter Intelligence output
(pick one — the first hearing pack, or the first argument map) is generated
in full, free, once. Repeat generation, continuous monitoring, and additional
matters require Pro.

Candidate A/B cells for a future experiment (§8), not chosen here:
1. First-outcome-free vs. generic 7-day time trial.
2. Which outcome is the free sample (hearing pack vs. argument map) —
   whichever has the higher activation-funnel correlation once
   `matter_specific_value_experienced` (already instrumented, §12/analytics
   this session) has real data to look at.

**Cost caveat, not optional**: a free full generation is real model spend per
new user, unlike a Tinder blur which costs nothing extra to show. Model this
against expected activation lift before running it as an open experiment —
§6 applies here most of all.

---

## 4. Contextual paywall triggers

Tied directly to the analytics events already shipped this session
(`apps/mobile/src/analytics/events.ts`) so a trigger fired here is
measurable from day one, not retrofitted:

| Trigger | Event | Why it's real context, not manufactured |
|---|---|---|
| First matter created | `matter_created` (`ordinal: 1`) | Genuine first-use milestone |
| N authorities saved to one matter | `authority_saved` count | Reflects actual research depth, not a countdown |
| Locked insight tapped | `premium_preview_opened` | Direct intent signal |
| Second matter attempted | `second_matter_attempt` | A real usage-volume boundary, not invented scarcity |
| Hearing creates real prep value | `hearing_pack_preview` | Tied to an actual calendar date already shown free |
| Matter change detected | `matter_specific_value_experienced` (`kind: 'authority_map'`) | The change is real; the notification of it is what's gated (§2C) |

**Never**: fake countdowns, fake "new results," false scarcity, hidden close
buttons, a preselected plan chosen by the paywall rather than the user
(directly forbidden by Apple 3.1.2(c) and Google's deceptive-UI rule per the
research doc §Apple/§Google).

---

## 5. Paywall copy — direction, not final copy

Outcome-first, personalised proof, never a feature grid:

> **Walk into your next hearing prepared.**
>
> 7 authorities · 4 issues · 2 counterarguments · 1 unresolved risk
>
> [ Preview ]
>
> Unlock full hearing preparation.
> *Continue with free research* (secondary, always present, never hidden)

**Citation-harness copy rules apply here without exception** — this is not a
separate copy system. "Safe to file," never "we verified this." A locked
insight's preview may never imply a legal fact is being withheld — if a
preview would need to hide the existence of a real risk to look enticing,
that risk is free per §0, full stop, and the copy is rewritten instead.

---

## 6. Premium preview cost control

Every candidate in §2 classified — **as of 23 Aug 2026, this table is a query
against LCC's built `GET /matters/:id/premium-preview`, not an assertion**
(bus 1053: a test asserts the endpoint writes zero `llm_calls` rows, 10/10 in
`premium/route.test.ts`):

| Preview element | Cost class | Basis |
|---|---|---|
| Authority count (total, unsplit) | **cheap** | `matter_authorities` row count, live |
| Authority stance split (supporting/contrary) | **expensive — moved here 23 Aug** | No stance column exists on `matter_authorities` (LCC, bus 1051/1053); computing it is synthesis, not a count. §2A corrected accordingly. `stanceNotComputed: true` on the wire until this is designed. |
| Adverse/overruled authorities present | **cheap, and never gated regardless of cost** | Live `overruled_status <> 'none'` read — typed `SAFETY_CRITICAL` server-side; `requireCapability` refuses to gate it, enforced by a test, not just this document's §0 |
| Hearing date, event count, unresolved filings | **cheap** | `matters.next_hearing_date`, `matter_events`, same date rule `briefings/assemble.ts` already uses — preview and briefing cannot disagree |
| Full argument map / hearing pack / counterargument synthesis | **expensive** | Real LLM call, sensitive-class routing (§7) |

`events.ts`'s `costClass: 'cheap' \| 'expensive'` field (already shipped this
session on `premium_preview_seen` and `premium_outcome_generated`) exists
specifically so this table is measurable in production, not just asserted
here. **No free-user preview may trigger an `expensive` computation** — every
preview in §2 above only surfaces already-computed or cheap-to-compute state.

---

## 7. The blocker every synthesis hypothesis in this document shares

**None of §2's Pro-gated synthesis features (argument map, hearing pack
generation, counterargument synthesis) may call a real model on real matter
data yet.** Matter content is sensitive-class (`CLAUDE.md` §5/§6a): party
names, client detail, case notes. Routing rule already settled (OD-6): route
by sensitivity, pseudonymise before any sensitive-class call, one document
per call, and **the countersigned DPA is still owed** before any sensitive
upload/matter-content path ships at all — OD-6's own resolution says so
explicitly.

So every "expensive" cell in §6's table is currently **behind two gates, not
one**: the cost-control gate (build the preview cheap) and the data-routing
gate (the actual generation cannot run in production against real matter
content until the DPA exists). What can proceed now: the deterministic/free
halves of §2 (counts, banners, dates), the analytics instrumentation (done,
this session), and design work. What cannot: wiring a real "Generate full
prep pack" button to a real model call against a real matter, in production,
today. **Synthetic seeded data may be used for product testing** per the
founder's own instruction — the 10-matter walkthrough (queued, not run this
session) should use exactly that, never a real advocate's matter.

---

## 8. Experiment shape, named not built

Every hypothesis above needs, before it ships to real users:
`experiment_id`, `variant`, assignment (server-issued, one user stays in one
variant — `events.ts`'s `ExperimentContext` type already carries this shape),
exposure, conversion, retention, refund/cancel, cost. **A variant that lifts
`purchase_completed` while worsening `subscription_cancelled`,
`refund_requested`, or matter engagement is not a win** — the churn events
(`subscription_cancelled` with `cancelReason` and `premiumUsageBeforeCancel`,
`refund`, `billing_failure`) are already first-class in the same contract, not
an afterthought bolted on later. No experiment-assignment service exists yet
(nothing to assign against — there is no paywall in production); this section
names the shape so whoever builds the first paywall does not have to
retrofit measurement onto it.

Every new paywall/preview/credit/monitoring-promise must be remotely
disableable or server-capability gated before it ships — client existence
must never imply backend capability, per the founder's own correction. No
feature-flag infrastructure exists in this repo yet (checked this session);
building one is a prerequisite for shipping any hypothesis above, not a
follow-on.

---

## 9. What this document does not do

Does not set a rupee price for anything. Does not choose between Hypothesis A
and B. Does not decide the free-sample question in §3. Does not build a
single screen. Does not wire a single LLM call. It is the ranked-hypotheses,
compared-alternatives artefact the founder's P2/P3/P4/P6/P7 instructions
asked for, ready for a founder go/no-go on the open questions named in §1,
§3, and §7.
