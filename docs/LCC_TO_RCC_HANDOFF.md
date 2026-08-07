# LCC → RCC — what the server lane changed, 8 Aug 2026

Paste-able into RCC's runtime. Kept in the repo so it survives compaction and a
fresh agent. Newest block at the top; do not delete old blocks, append.

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

Both were byte-identical to the versions that commit `6a49b09` had *replaced,
because they broke settled product rules*. So for a few commits the repo showed
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

| hex | job it does | reach |
|---|---|---|
| `#C3BEB2` | the dashed edge on an unavailable / not-held card — the documented treatment for **our own uncertainty** | **9 of 9** dashed borders in the whole canvas set. Unanimous. |
| `#F5EDDC` | ink on the navy `#141B2D` surface — there is no light-on-dark ink token | 8 canvases, 26 uses |

Neither is in `apps/mobile/src/theme/tokens.ts`. They were being carried per-file
in the rules baseline, which grew by two lines every delivery and made a **missing
token** look like a recurring mistake by the design lane. It is not one: both do a
job the settled rules *require* — dark surfaces exist throughout, and "our own
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
*opposite* directions. `design/SCREENS.md` said "None is drawn" for rows 88–99
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
