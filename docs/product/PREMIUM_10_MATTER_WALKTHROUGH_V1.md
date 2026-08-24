# The 10 synthetic-matter walkthrough — what actually happens end to end

**Run 23 Aug 2026, NEW3 (product/mobile/premium/release lane).** Executed
against the real local `services/api` (LOCAL_QUIET — no other process hitting
this API during the run; the ingest fleet and other lanes' DB writes were
concurrent at the Postgres level only), over real HTTP, with real auth
(magic-link → verify → bearer token), driving the same routes the mobile
client calls. **Synthetic data only** — 10 matters, 10 throwaway accounts
(`new3.synth.<key>@lawmind.test`), all deleted from the local DB at the end of
this run (`matters`, `matter_authorities`, `matter_events`, `briefings`,
`judgment_annotations`, `users` rows — 30 matters across 3 iterations of the
driver, 10 user profiles). Driver script and raw JSON output were scratch
files, not committed.

Premium routes were temporarily flagged ON in the local `platform_config`
table for this run only (they default to no row → 404 in every other
environment) and the four rows were deleted again afterward — confirmed 0
`premium%` rows remain. This is local verification, not an activation; nothing
about the public default changed.

No UI screenshots below — this is API-level, because that is the only way to
get **10 real matters through 8 workflow stages with actual retrieval
behind them** inside one session, and because a defect at this layer is a
defect no amount of UI polish fixes. Where a mobile screen exists for a step,
its file is named and its consumption of the API response is checked against
what the API actually returned, not assumed.

## The 10 matters

| # | Type | Case title | Search query used |
|---|---|---|---|
| 1 | Criminal bail | State v. Rakesh Kumar | anticipatory bail |
| 2 | Criminal trial | State v. Suresh Yadav | murder trial, dying declaration |
| 3 | Writ/service | Meena Devi v. State of Bihar | compassionate appointment writ |
| 4 | Commercial | Ganga Traders v. Om Industries | breach of contract, damages |
| 5 | Arbitration | Nilgiri Constructions v. State PWD | s.34 patent illegality |
| 6 | Injunction/property | Ashok Verma v. Vinod Verma | temporary injunction, possession |
| 7 | Family | Priya Sharma v. Anil Sharma | s.125 CrPC maintenance |
| 8 | Civil appeal | Bharat Cements Ltd. v. RTO | first appellate reversal of fact |
| 9 | Regulatory/tax | Suvidha Exports v. Commissioner of GST | inverted duty ITC refund |
| 10 | Constitutional | Federation of Street Vendors v. UOI | Art. 21 right to livelihood |

## Per-stage scoring

| Stage | Score | Evidence |
|---|---|---|
| Search → find a candidate authority | **PARTIAL** | 10/10 returned 5 results, 200 OK. 5/10 runs carried `degraded: ["sparse_timeout"]` even under a quiet local box — confirms NEW1's own finding that the sparse arm is not reliably fast, now observed from the product side, not just the benchmark side. 9/10 top results were genuinely on-point (see below); 1/10 (commercial breach-of-contract) returned an unrelated criminal robbery judgment. |
| Create matter | **WORKS** | 10/10 `POST /matters` → 201, real row, real id. One real defect found and fixed *in the test*, not the product: onboarding (`PATCH /me` with `fullName`+`phone`) is required before a matter can be created (`PROFILE_INCOMPLETE`, 403) — correct API behaviour, just undocumented in the walkthrough's own assumptions until it failed once. |
| Save authority | **WORKS** | 10/10 `POST /matters/:id/authorities` → 201. Verified independently three ways for the bail matter: the row exists in `matter_authorities` (direct DB read), `GET /matters/:id/authorities` returns it with `verificationState: verified`, `verifiedBySource: corpus`, `overruledStatus: none` — all DB-derived, nothing invented — and the premium preview's `authorityCount` matched. |
| Treatment / currentness | **WORKS** | 10/10 `GET /judgments/:id/treatment` → 200. Row counts varied honestly with the real corpus (0, 1, 4, 8, 11, 17 — not a fixed number), `chronologyReliable: true` / `datesContradicted: 0` on every sampled judgment, `dateQuality` present per row. No fabricated "good law" language anywhere in the payload — matches the currentness copy rule. |
| Timeline / event | **WORKS** | 10/10 `POST /matters/:id/events` (hearing, order text, private note) → 201, then visible on `GET /matters/:id`. |
| Hearing state | **WORKS** | `nextHearingDate` round-tripped correctly through create → get on all 10. |
| **Briefing generation** | **UNSAFE** | See finding #1 below. The mechanism runs and produces a real document, but the authorities block and the checklist item derived from it are **factually wrong on a matter that has a saved authority**, and the mobile `BriefingScreen.tsx` renders that wrong claim verbatim with no independent check. This is exactly the class of defect OD-14 was fixed for, in a sibling code path OD-14's fix did not reach. |
| Premium preview | **WORKS, and it refuses to lie** | 10/10 `GET /matters/:id/premium-preview` → 200, `costClass: cheap`, real `authorityCount`/`eventCount`/`adverseAuthorities` (0 on all 10 — none of the saved authorities happened to be overruled) drawn from live tables, and — the important part — `stanceNotComputed: true` with an honest `notComputed` list rather than a fabricated supporting/contrary split. This is LCC's fix for the SPEC_V1 §6 error (bus 1053) and it holds up under real matters, not just the unit test. |
| Counterargument | **WORKS, 9/10 on-point** | `POST /arguments/counter` → 200 on all 10, and returned a **real retrieved judgment with an exact, paragraph-anchored span** (`operativeParagraph`, `operativeParagraphNumber`, `operativeParagraphVerified: true` on several), not a generated summary. 9 of 10 results are genuinely strong, checkable precedent for the stated position (Olga Tellis for Art. 21/livelihood, VKC Footsteps for inverted-duty ITC refund, Mohd. Abdul Samad for s.125 maintenance, Vinod Kumar v. Gangadhar for first-appellate reversal — all real, correctly-matched Supreme Court authorities). 1 of 10 (commercial breach-of-contract) surfaced an IPC §394 robbery conviction — see finding #2. |
| Alerts / monitoring | **PARTIAL** | `PATCH /me/alert-settings` and `GET /alerts` both 200 on all 10; `alertsList` count is 0 on every matter, which is *correct* (nothing has moved yet on a matter created seconds ago) but means monitoring itself was not observed firing in this run — only that the settings and read paths work. Push delivery is separately known UNVERIFIED (no EAS project, `FQ-PUSH-PROJECT`), so an alert firing server-side would not reach a device today regardless. |
| Premium job start (entitlement gate) | **WORKS — correctly refuses** | `POST /premium/jobs` with a real `idempotencyKey`, real `matterId`, capability `matter_automation` → **402 `NOT_ENTITLED`** on a free-tier synthetic user, every time. This is the fail-closed behaviour the plan requires, observed rather than assumed. `GET /me/entitlements` correctly returns `capabilities: []` and a `catalogue` where every premium capability is marked `PROVISIONAL`. |

## Finding #1 (P0, LCC-owned) — the briefing's authority list and checklist read the wrong table — **CLOSED, bus 1078**

**Update, same round:** LCC fixed this and found it was not confined to the
briefing. The same pre-OD-14 rule was running stale in three more DECISION
paths — `judgments/annotations.ts` (annotating into a matter was refusing
what `POST /matters/:id/authorities` allowed, same authority, same matter,
same second, one door open and one shut), `documents/route.ts` (the draft
citation surface), and `arguments/counter.ts` (the most dangerous of the
four: it filtered on the raw `overruledStatus !== 'set_aside'` banner, which
moved 73 authorities from `authorities[]` into `excluded[]` — telling an
advocate that adverse law their opponent can reach for does not exist,
which is the opposite direction of a refusal-to-act bug). All four now
share `judgments/treatment-lookup.ts`. LCC also found and fixed the half a
sweep-only fix could not see: `blocks.checklist` was served verbatim from
the stored blob while `authorities[]` beside it was read live, so a status
that moved after the 23:00 sweep left the two halves disagreeing —
asymmetrically, in the dangerous direction (an authority set aside
overnight got its live banner and no checklist item at all). `GET
/briefings/:id` now rewrites the checklist's authority-moved items from the
same state the authority block renders from. Proof:
`docs/ai/lcc/BRIEFING_OD14_GENERATION_PROOF.md`, a regression fixture proven
to FAIL under deliberately restored pre-OD-14 semantics first. This
walkthrough's own reproduction below is left as originally written — it is
what found the defect and it is still accurate as a description of the bug
that existed, not of the code as it now stands.

**`services/api/src/briefings/assemble.ts:104-113`** builds the briefing's
"authorities" block and its "no authorities saved" checklist item from
`judgment_annotations` (a paragraph-level quote/pin-cite an advocate makes
while reading a judgment, optionally tagged to a matter — `POST
/judgments/:id/annotations`). **It does not read `matter_authorities`**, which
is the table the actual "save this judgment to my matter" action writes to
(`POST /matters/:id/authorities` — the button every other surface,
including the premium preview's `authorityCount`, treats as the save-authority
action).

Reproduced live: for the `bail` matter, an authority was saved via `POST
/matters/:id/authorities` at `16:12:11` (confirmed in `matter_authorities`,
confirmed via `GET /matters/:id/authorities`, confirmed in the premium
preview's `authorityCount: 1`). The nightly sweep (`pnpm --filter
@lawmind/cron sweep --date 2026-08-24`, the real cron entrypoint, not a
simulation) ran at `16:15:29` — four minutes later, well after the save — and
generated a briefing whose `blocks.authorities` is `[]` and whose checklist
contains:

```json
{"id":"no-authorities","text":"No authorities are saved to this matter.","basis":"no annotations reference this matter"}
```

`GET /briefings/:id` (the same route the client calls) returns exactly this.
`apps/mobile/src/screens/briefing/BriefingScreen.tsx:176,185,316-332,367-372`
reads `briefing.blocks.checklist` and `briefing.authorities` with no
independent check and renders **"No authorities were attached to this
briefing"** plus the checklist line verbatim.

This is not a UI bug and not a cosmetic mismatch. The 24-hour briefing is Tier
A feature #2 — "the wedge" — and its entire value proposition is that an
advocate can trust what it tells them the night before a hearing. Telling an
advocate who saved an authority that they saved nothing, hours before they
stand up in court, is the same shape of harm OD-14 was raised to fix (a
generated document contradicting live state) and OD-14's own fix
(`treatment-checklist.ts`, `treatment-lookup.ts`, referenced in this very
file's comment at line 149) **did not reach this block**, because this block
never queries `matter_authorities` at all — there is no stale value to
correct, the query is simply pointed at the wrong table.

**Was not something this lane fixes** — `services/briefings/assemble.ts` is
server logic, LCC's file. Reported to LCC on the bus (seq 1075) with the
exact reproduction above; closed same-round, bus 1078, per the update at the
top of this section. This client also picked up its own half of the fix —
`arguments/counter.ts`'s new `precedentialEffect` field on `excluded[]`
entries is now consumed so the counter-argument screen never says an
authority "has been set aside" when the server's own `review_required`
value means it explicitly would not assert that (see
`apps/mobile/src/screens/draft/CounterArguments.tsx`'s `exclusionReason`).

## Finding #2 (P1, NEW1/retrieval-owned, informational) — one matter's counterargument authority was wrong-domain

The `commercial` matter's stated position ("Om Industries breached the supply
agreement and is liable for consequential damages") returned, as its
top/only counterargument authority, *Pappu @ Sanjeev Sharma v. State of
Rajasthan* — an IPC §394 (robbery) criminal conviction, sentencing detail
included, with no connection to contract law. This is not a hallucinated
citation (the judgment is real and the span is real, per the harness's own
exact-span rule) — it is a **relevance failure**: the retrieval behind
`/arguments/counter` surfaced an unrelated criminal matter for a civil
commercial-breach query. 9 of 10 other matters in this run returned strong,
correctly-matched precedent (three of them landmark Supreme Court judgments —
*Olga Tellis*, *VKC Footsteps*, *Mohd. Abdul Samad* — matched exactly to their
stated legal question), so this reads as an isolated miss rather than a
systemic failure, but it is exactly the kind of miss the plan says must never
be marketed as solved. **Not counted against NEW1's P0 representation work**
— that work is about the general search path, not this single
counterargument call — but it belongs in NEW1's evidence pile as one more
posed-query miss, and it is why "the counterargument feature finds the
relevant law" cannot be claimed publicly without a broader sample than 10.

## What this run does NOT claim

- **Not a claim that briefings are safe to market.** The opposite: finding #1
  is a concrete reason they are not, yet, on the authorities/checklist block
  specifically. The last-order and pending-applications blocks were not
  independently defect-tested this round (both rendered correctly for
  matters with no order/filing recorded, which is all 10 had).
- **Not a claim that search or counterargument work generally.** 9/10 is ten
  matters, not a benchmark; NEW1's ADVOCATE-100 numbers (bus 1057-1067) are
  the actual measured baseline and they are materially worse on concept
  classes than this sample suggests — this run's positions were written in
  plain advocate language but were not adversarially chosen to stress
  retrieval the way ADVOCATE-100 was.
- **Not a claim that alerts/monitoring work end-to-end.** Only that the
  settings and list endpoints answer correctly; no state-change was observed
  to actually produce an alert in this run, and push delivery is separately
  known unverified.
- **Not a claim about mobile UI quality, accessibility, or performance.**
  This run exercised the API contract each relevant screen consumes, and
  checked one screen's rendering logic against a real bad response
  (finding #1). It did not launch the app on a device.
- **Not a claim that the premium job pipeline produces good output on real
  matter data.** `POST /premium/jobs` was only exercised far enough to prove
  it refuses without entitlement (correct, and important) — no entitled path
  was tested, because granting one would require inventing an entitlement
  outside the real purchase flow, which this run deliberately did not do.

## Net read

Free-tier product mechanics (search, save, treatment, timeline, hearing
state) are solid — every one of them WORKS against real data with no
fabrication observed. The premium spine correctly refuses to lie in two
different ways in this run (no fabricated stance split; no free generation
without entitlement) and that discipline is real, not asserted. **Finding
#1, the one defect that actually blocked a "the briefing is trustworthy"
claim, is now closed** — LCC fixed it same-round (bus 1078) and found it
was three defects wider than this walkthrough alone showed. **What remains
holding the briefing/Hearing Pack back is exactly what the plan's §1.3
already named before this round started: retrieval breadth and
adverse-authority discovery reliability** — NEW1's own numbers (concept
classes at or near zero reachability) are the standing reason, untouched by
this fix, and `PREMIUM_COMMERCIAL_DECISION_PACKAGE_V2.md` §2 treats that as
the live blocker on Model B/C now that this round's own defect is off the
list.
