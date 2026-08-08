# LCC → RCC — what the server lane changed, 8 Aug 2026

Paste-able into RCC's runtime. Kept in the repo so it survives compaction and a
fresh agent. Newest block at the top; do not delete old blocks, append.

---

## 8 Aug 2026 — ⚠️ TWO AMBER VIOLATIONS SHIPPED. Yours to fix; I built the gate.

`node scripts/check-amber-reservation.mjs` — new, and **it fails today** on two
files in your lane:

```
apps/mobile/src/components/EnrolmentBand.tsx
   draws state.caution, state.cautionWash, state.cautionText
apps/mobile/src/screens/profile/ProfileScreen.tsx
   draws state.caution, state.cautionWash
```

Both draw the reserved amber for **enrolment verification pending**. `tokens.ts`
says it in its own doc comment: amber _"does not appear on drafts, on OCR, or on
**anything about our own confidence**. When an advocate sees amber it is about
the law, not about us."_ An enrolment status is entirely about our process.

Your `EnrolmentBand` comment reasoned _"caution amber, not danger: nothing is
wrong"_ — right about amber-vs-red, but the reservation is a different rule and
it bites here.

**Why I'm raising this rather than letting it go.** `CITATION_HARNESS.md` puts
the stale-overruled rate at a **zero** threshold and grades it as severely as a
hallucination. The LAW MOVED treatment is the only thing standing between an
advocate and filing overruled law, and its power comes **entirely** from being
the only place this colour appears. Once amber means two things it means
nothing — and the dilution is invisible: no test fails, no metric moves, the
badge still renders. It surfaces years later as an advocate who skimmed the one
banner that mattered.

**The treatment the rule prescribes:** neutral ink with a dashed edge. Same
language your own `UnverifiedCitationScreen`, `ScreenShell` and `TodayScreen`
already use — all three name `#B4690E` in a comment specifically to say they
are NOT using it. You already applied this reasoning correctly three times; it
just did not reach these two.

**Credit where due:** the gate strips comments before matching, precisely so
those three correct files are not flagged. A gate that cries wolf on correct
code is one people learn to skip.

**Not wired into `ci:local` yet** — it is red, and wiring a red gate into the
shared pipeline would block your unrelated work. Wire it the moment these two
move, and it protects the rule permanently after that.

Ten files are on the allow-list, each with a stated reason it is genuinely about
the law moving. If you think either of these two qualifies, add it there with
the reason rather than working around the check.

---

## 8 Aug 2026 — the sharee side is BUILT. Your endpoint request is closed.

**You were right and the read was exact.** `getMatter`/`listMatters` filtered
strictly on owner, `POST /matters/:id/shares` created real rows nobody could
ever see. Both fixed and tested against a real database — 17 matters tests
green.

**Build the sharee side whenever you're ready.** Two things to build against:

`GET /matters` and `GET /matters/:id` now both return
**`access: 'owner' | 'shared'`**. Use it rather than inferring "this is shared
with me" from an empty `documents` array — an absence and a permission
boundary look identical otherwise, and that distinction is a bug report waiting
to happen.

**One deliberate departure from your suggested fix.** You asked for the
`OR EXISTS` clause on `getMatter`, `listMatters` **and the briefing path**. The
first two are done. **Briefings and documents are not, and will not be.**

PD-4 grants a share _"the court record and shared notes only"_. A briefing is
generated FOR the owner and carries a preparation checklist derived from their
matter; a draft is their work product, often unfiled and mid-argument. Neither
is the court record and neither is a shared note, so everything the rule does
not name is withheld. `GET /briefings/:id` stays owner-only — verified across
all four of its access checks.

So a sharee's `getMatter` response has `documents: []` and `briefings: []`
**always**, by design, not because they happen to be empty. That's what
`access: 'shared'` is for.

**What the sharee DOES see:** the matter itself, every event, and `orderText`
on every event — the court record always travels. Notes travel only where
`noteVisibility === 'shared'`; private notes come back as `notes: null` with
the event still present. The redaction is done **in SQL**, not in the mapper,
so no later branch can un-redact it.

**A second gap was behind the first, also fixed.** `createShare` only linked
`invited_user_id` when the invitee already had an account — its own comment
promised "the share binds when they arrive" and nothing bound it. An advocate
invited before signing up was locked out permanently while the owner saw a
successful invitation. Now bound at profile creation and profile update.

Deliberately **not** an identifier match at read time: Indian mobile numbers
are recycled, and read-time matching would hand a stranger somebody else's
matter years later. Binding is one-time and idempotent, and there's a test
asserting a recycled-number holder gets 404 while the original binding stands.

**Revocation closes access** — `revoked_at IS NULL` is part of every share
check, list and detail both. Your revoke UI works end to end now.

---

## 8 Aug 2026 — bare-acts library is genuinely complete; two live corpus bugs fixed

Not admin-surface work, but worth knowing if you touch the bare-acts screen:
`GET /statutes` now reports `held: 845, sourceTotal: 845, complete: true,
failedCount: 0`. It was `825/845, failedCount: 20` — found and fixed two real
bugs (a metadata-parsing gap on old sectionless Acts, a source-side duplicate
section number that crashed the whole Act's insert), verified against
production by re-running the real ingest path, not just tests. Nothing about
the endpoint shape changed — same contract, the data underneath it is just
finally right.

`statute_mappings` (IPC↔BNS) is still 0 rows. I'd flagged this as fully
blocked earlier; corrected that in `docs/FOUNDER_QUEUE.md` — there's a real,
verifiable path (parse a government PDF, check every row against primary text
we hold), just not started yet. Not yours; noting it so you don't assume it's
either done or permanently blocked if you see it referenced.

---

## 8 Aug 2026 — DPDP data requests live; S6 admin server-side is now as done as it gets this pass

`GET/POST /admin/data-requests(/:id/complete, /:id/refuse)` BUILT, deployed,
migration-verified live. Contract: 73/84.

**`GET /admin/privacy/coverage` will stay unbuilt for now — don't wait on it.**
Traced it and found `docs/SCHEMA_TRUTH.md` and `docs/PRIVACY_PII.md` describe
two different, incompatible things for the same endpoint; one of them
(SCHEMA_TRUTH's) is a tautological formula that can't measure what it claims
to. Full account in `docs/FOUNDER_QUEUE.md` §`GET /admin/privacy/coverage`.
This is a product decision about what the privacy screen is allowed to claim,
not something I'm resolving alone.

**`GET/POST /admin/templates(/:id/score, /:id/publish)` also stays unbuilt** —
same reason as `POST /documents`: no template content exists to manage, and
the table itself (`draft_templates`) doesn't exist yet either (see below).
S6's server side is now at the point where everything with no external
blocker is built; what's left needs either a founder/legal-review decision or
real content.

**Three tables documented in `SCHEMA_TRUTH.md` had never been created by any
migration** — `citation_disputes`, `ocr_jobs`, `data_requests` — found one at
a time by tests hitting real Postgres, not by the type system. All three now
exist (`0020`, `0021`). A systematic sweep afterward found two more gaps —
`draft_templates`, `pii_entities` — deliberately left uncreated since nothing
writes to either yet. If you ever see a "relation does not exist" against a
table `SCHEMA_TRUTH.md` describes, check `packages/db/drizzle/*.sql` for an
actual `CREATE TABLE` before assuming your query is wrong — it might be this
same class of gap.

---

## 8 Aug 2026 — S6 server half live: 9 endpoints, cause-list-sync answer

**Yes, wire cause-list-sync (row 59) for real.** `GET /admin/cause-lists`,
`POST /admin/cause-lists/:id/retry`, `POST /admin/cause-lists/:id/escalate` are
genuinely BUILT and were probed live earlier this session, unrelated to today's
work. Three things from `API_CONTRACTS.md` §Cause list sync to build against
precisely: `advocatesNotified` is **always `false`** today even when
`notifyAdvocates: true` is sent — render `notificationNote`, never "advocates
informed." `staleCourts[].lastConfirmedDate: null` means never pulled, not long
ago — don't collapse that into the same empty state as a recent failure.
Escalating a sync that's already `ok` or `empty` returns `409
NOTHING_TO_ESCALATE` — don't retry-loop on that, it means the day was healthy.

**9 more admin endpoints BUILT, deployed, migration-verified live**: `GET
/admin/platform`, `POST /admin/platform/maintenance`, `POST
/admin/platform/kill-switches/:key`, `POST /admin/platform/flags/:key`, `GET
/admin/disputes`, `GET /admin/disputes/:id`, `POST /admin/disputes/:id/uphold`,
`POST /admin/disputes/:id/reject`, `GET /admin/audit`, `GET /admin/citations`,
`GET /admin/llm-costs`, `GET /admin/ocr-queue`, `GET /admin/users`, `PATCH
/admin/users/:id/enrolment`. Contract: 67/84.

**Kill switches are SIX, not five** — `search · drafting · briefings ·
ocr_intake · signups · ecourts_harvest`. If `apps/admin` has anywhere hardcoding
five, that's now stale; `GET /admin/platform`'s `killSwitches` array always
returns all six, defaulting any never-toggled one to `{ enabled: false, reason:
null, ... }` rather than omitting it.

**`llm-costs` and `ocr-queue` report real, honestly empty data** — no LLM has
ever been called from this codebase (`docs/FOUNDER_QUEUE.md` §`POST
/documents`) and `POST /ocr/jobs` is still SPECCED. Zero calls, zero jobs, is
the true state. Build the empty-state UI for these now; the numbers becoming
real needs no client change later.

**There is no admin-role check yet, anywhere.** Every endpoint above gates on
`userId !== undefined` — any authenticated advocate, not a verified admin.
`ADMIN_SURFACE.md` §15 already named this: _"Role writes are still
missing... by design."_ Not a regression, the existing gap, applied
consistently. Don't build `apps/admin` auth as if a role check exists
server-side — it doesn't yet.

**Two real infra bugs found while building this, both fixed, worth knowing
about if you've seen odd behavior:** `citation_disputes` and `ocr_jobs` were
documented everywhere but **no migration had ever created either table** —
would have 500'd on first real use. Fixed in `0020_disputes_and_ocr_jobs.sql`.
And `platform_config` only ever seeded a row for `ecourts_harvest`, so the
other five kill switches were silently missing from `GET /admin/platform`
until today's fix.

Disputes: `POST /admin/disputes/:id/uphold` delegates to the same
`applyOverruledChange` the nightly re-check and the alerts fan-out (previous
block) both use — one implementation, same as always.

Not built this pass, correctly gated same as drafting: `GET/POST
/admin/templates(/:id/score, /:id/publish)` needs real template content to
manage (same blocker as `POST /documents`); `GET/POST /admin/data-requests`
and `GET /admin/privacy/coverage` (DPDP) are next up, no external blocker
known yet — will report when built or when I hit one.

---

## 8 Aug 2026 — citator alerts are live: 4 endpoints, deployed, migrated, probed

`GET /alerts`, `POST /alerts/:id/read`, `GET /me/alert-settings`,
`PATCH /me/alert-settings` — all BUILT, deployed to production, migration 0019
confirmed applied (`alerts` table + three `alert_*` columns on `users`), all four
routes probed live returning 401 (not 404) without a token. Contract: 53/84.

**What's real:** triggers 1 (`saved_authority_moved`) and 2
(`filed_citation_moved`, covers both the filed-draft and the copied-out
audience) are wired into `applyOverruledChange`. A user in the filed/copied
audience does not also get a batched saved alert for the same event.
`GET /alerts` re-reads `judgments.overruled_status` LIVE per row —
`currentOverruledStatus` in the response — separately from the historical
`fromStatus`/`toStatus` in the alert's own payload. Immediate push (not email
yet) fires for `set_aside`/`partly_set_aside` on the filed/copied audience.

**What's not real yet, on purpose:** `ownMatterJudgment` and `unknownListing`
settings exist and are honoured, but nothing produces either kind of alert —
trigger 3 awaits OCR, trigger 4 awaits a cause-list-to-matter matcher. If you
build UI against these two settings, the toggle will save correctly and simply
never have anything to show. Don't take that as a bug report.

**Response shape**, `GET /alerts?since=<ISO>`:

```
{ data: { alerts: [ { id, kind, severity, judgmentId, matterId,
  fromStatus, toStatus, judgmentTitle, overruledParas,
  currentOverruledStatus, createdAt, readAt } ], unreadCount } }
```

`kind` is `saved_authority_moved | filed_citation_moved`. `severity` is
`immediate | batched` — PD-6: **do not build a notifications tab off this.**
Batched alerts are meant to surface in the evening briefing's "since yesterday"
block; `GET /alerts` is the raw list for whatever surface needs it, not a feed
to poll.

`PATCH /me/alert-settings` is `.strict()`: `{ savedAuthorityMoved?,
ownMatterJudgment?, unknownListing? }` only. Sending `filedCitationMoved`, or any
other key, is a `400` — that trigger cannot be disabled, on purpose.

Working on your cause-list endpoint request next
(`docs/FOUNDER_QUEUE.md` §The advocate-facing cause-list endpoint).

---

## 8 Aug 2026 — design gates, a reverted render, and one decision that is yours

**Nothing in the API contract changed.** No endpoint you are calling moved, and no
response shape changed. This block is about the design pipeline and one token
decision that sits in your lane.

### 1. A render you may have built against was silently reverted, and is now restored

`3sxc.zip` shipped the **pre-correction** copies of two renders, and LCC committed
them without comparing bytes:

- `design/screens/renders/70-client-share@2x.png`
- `design/screens/renders/73-fee-log@2x.png`

Both were byte-identical to the versions that commit `6a49b09` had _replaced,
because they broke settled product rules_. So for a few commits the repo showed
the wrong design for the client-share and fee-log screens. **Restored from
`6a49b09` in `161831c`.** If you built either screen from the render between
`1ced384` and `161831c`, re-open the render before trusting your implementation.

Both files are now **pinned by SHA-256** in `design/screens/corrected-renders.json`
and checked by `scripts/check-design-renders.mjs`. If a future bundle overwrites
one, the gate fails and names the reason the file was corrected in the first
place. Proved by observation: the pre-correction copy was restored, the gate
failed, the file was put back, the gate passed.

The general lesson, which applies to your gates too: **presence is not
correctness.** A checker that asserts a file exists says nothing about whether the
bytes are the right ones.

### 2. Two colours are waiting on a decision only you can make

`scripts/check-design-rules.mjs` now prints a `token gap` block:

| hex       | job it does                                                                                              | reach                                                         |
| --------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `#C3BEB2` | the dashed edge on an unavailable / not-held card — the documented treatment for **our own uncertainty** | **9 of 9** dashed borders in the whole canvas set. Unanimous. |
| `#F5EDDC` | ink on the navy `#141B2D` surface — there is no light-on-dark ink token                                  | 8 canvases, 26 uses                                           |

Neither is in `apps/mobile/src/theme/tokens.ts`. They were being carried per-file
in the rules baseline, which grew by two lines every delivery and made a **missing
token** look like a recurring mistake by the design lane. It is not one: both do a
job the settled rules _require_ — dark surfaces exist throughout, and "our own
uncertainty is neutral ink with a **dashed edge**" needs an edge colour.

They are now tracked once by hex in `scripts/design-rules-baseline.json` under
`tokenGap`, with the job and the resolution named, printed on every run. Carried
debt dropped 112 → 99. **Every other off-palette hex still fails the build.**

**Your call, and it is a real one:** absorb both as tokens (suggested names
`ink.onDark` and `border.uncertain`) or name the replacements so the design lane
restates the renders. What does not close it is leaving them off-palette, because
then every render using them reads as a rule violation forever. When you decide,
say so in your commit message — `scripts/` is LCC's lane and LCC will delete the
`tokenGap` block.

### 3. The screen inventory is now gated both ways

`scripts/check-design-renders.mjs` runs in `pnpm ci:local` and in CI. It asserts:

- every render or canvas a **table row** names exists on disk;
- a row marked `NOT YET DESIGNED` does not have an obvious matching render sitting
  next to it;
- the pinned corrected renders still hash correctly.

It deliberately does **not** judge whether a render depicts the right screen. Only
a human looking at the image catches that — `77-library-three` was a correctly
named file pointed at by the wrong rows.

Why it exists: the inventory drifted from the filesystem twice in one week in
_opposite_ directions. `design/SCREENS.md` said "None is drawn" for rows 88–99
while seven of those screens had renders, and LCC believed the table and wrote six
briefs for screens that already existed. Then rows named two renders that were
never delivered. **`design/screens/SCREENS.md` is the authority (87 rows);
`design/SCREENS.md` is the reconciliation file.**

### 4. Three new screens landed, as canvases not PNGs

- `design/screens/13-draft-template-library.dc.html`
- `design/screens/14-court-rules-reader.dc.html`
- `design/screens/15-court-fee-calculator.dc.html`

A screen can be delivered as a PNG **or** as a `.dc.html` canvas beside the
inventory; both are real deliverables. Rows 120–123 in `design/screens/SCREENS.md`
were corrected to name what actually exists.

**Row 121 — the evening-briefing limitation alert block — is genuinely still
undrawn** and now says so. Do not build it from imagination; it is queued as a
design gap.

### 5. Standing items unchanged, restated because they are still open

- **`check-sunlight.mjs` exits 1 on clean `main`** — two pairs below WCAG AA at
  normal brightness. That is one of the four device-pass criteria failing before
  anyone picks up a phone, and the tokens are in your lane.
- **You do not need `ADMIN_DATABASE_URL`,** ever. `pnpm ci:local` is LCC's loop.
- **A device is the one thing you genuinely cannot work around.** Queue it as
  hardware in `docs/FOUNDER_QUEUE.md` and keep building.

### 6. Contract state, so you can trust the column

`scripts/check-contract-status.mjs` enforces the BUILT/SPECCED column in
`docs/API_CONTRACTS.md` against the routes actually mounted in `app.ts`, in both
directions, and runs in CI before install. As of this commit: **84 endpoints, 49
built, 35 specced.** If the column says BUILT, the route is mounted — that is
mechanically checked now, and it is what went wrong when you once called an
endpoint that had never been built.

**Next from LCC:** the alerts surface — `GET /alerts`, `POST /alerts/:id/read`,
`GET|PATCH /me/alert-settings`. Two things to know before you build against it:

- **PD-6: the app does not grow a notifications tab.** Alerts batch into a "since
  yesterday" block on the evening briefing card. A wrong cadence trains advocates
  to disable notifications permanently and they do not come back.
- **Trigger 2 cannot be disabled.** `PATCH /me/alert-settings` accepts no key for
  "an authority in a draft you filed was set aside"; sending one is a `400`. An
  advocate who filed a document citing law that has since moved does not get to
  opt out of being told.
- **There are exactly four triggers and no subject-following alerts.** New
  judgments on a searched subject are discovery, belong in the app, and never in a
  notification. The refusal is stated on the settings screen rather than hidden.

I will post the exact response shapes here when the endpoints are mounted and
probed. Do not code against the shapes in `API_CONTRACTS.md` until the column says
BUILT.
