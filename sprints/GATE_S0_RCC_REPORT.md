# GATE S0 — RCC LANE REPORT

Written 2 August 2026. Client lane, verifying the S0 build at `fa5a91e`.
Nothing was rebuilt for this report; every line below is an observation.

**Gate S0 has not passed.** Items 8 and 13 are unverified for reasons stated,
and the LCC half of the gate was still in flight when this was written.

---

## Verified by running it

| # | Check | The observation |
|---|---|---|
| 10 | No hex outside `tokens.ts` | `node apps/mobile/scripts/check-hex.mjs` → "No colour literal outside apps/mobile/src/theme/tokens.ts", exit 0 |
| 11 | Every route reachable, no dead route | `src/screens/manifest.ts` carries 119 entries against 119 numbered rows in `design/screens/SCREENS.md` — 98 app, 18 admin, 3 asset. No duplicate slugs, no row in one and not the other, only the three launch assets routeless, one `NOT YET DESIGNED` (row 3) which stubs itself. 18 admin slugs match 18 page directories exactly |
| 12 | Admin deploys on shared tokens | `next build` clean from an emptied `.next`; 21 routes in `app-path-routes-manifest.json`. `apps/admin/tsconfig.json` path-maps `@lawmind/tokens` to `../mobile/src/theme/tokens.ts`. Zero admin-only hex |
| 9 | Hindi at 1.72 | Rendered and **measured**, not eyeballed: legal Devanagari resolves to `NotoSerifDevanagari_400Regular` 17px / 29.24px line-height = **1.72 exact**; Devanagari UI = `NotoSansDevanagari` 16 / 27.2. Hindi eyebrows carry no letterspacing and no uppercase. The stress string (`क्ष ज्ञ श्र द्व ट्र`, nukta `फ़`, vocalic `ऋ`/`कृ`) renders with no dotted circles, no boxes, no clipped matras |
| — | Typecheck | `tsc --noEmit` → 0 errors, both apps |
| — | Micro-typography | Visible in the render: opening quote hangs outside the measure, `husband's` is curly, `302–304` is an en dash, the mono record line is tabular |

## Not verified — say so plainly

**Gate 8, "app builds on iOS and Android": UNVERIFIED.** The machine has
CommandLineTools only — no `xcrun simctl`, no Android SDK, no `adb`. There is no
simulator and no emulator. The closest available evidence:
`expo export --platform ios --platform android` exits 0 and produces
`entry-*.hbc` for both platforms (4.6MB iOS, 4.9MB Android) with all nine font
faces bundled. **That proves the graph compiles per platform. It does not prove
it runs.** This gate item needs a device.

**Gate 9's evidence is web, not native.** It came through react-native-web in
Chrome. The faces, sizes and leading are the real values `Text.tsx` resolves,
but the shaping engine is Chrome's, not CoreText or Android's — and Devanagari
shaping is precisely the thing that differs between them. **Re-check on a
Redmi-class device before treating this as green.**

**Gate 13:** `/ponytail-review` is not a repo command; it lives in the ponytail
plugin. Its review was run manually over the lane. Findings below.

**Sunlight check (contrast 0.5 / brightness 1.3) not run** — it needs human eyes
on the render.

---

## FOR LCC — the auth contract contradicts PD-1, and the client already diverged

This is the one item that will cost an integration if it is not settled before
S1.

- **`docs/API_CONTRACTS.md` §Auth, frozen:** `POST /auth/magic-link { email }`
  then `POST /auth/verify { token }`.
- **PD-1, settled:** "SMS OTP to any number the advocate enters." Drawn at
  canvas `11a`, `design/screens/renders/58-signin-otp@2x.png`.
- **`apps/mobile/src/api/mock.ts` ships `requestOtp(phone)` / `verifyOtp`** — it
  follows PD-1, not the frozen contract.

A previous session resolved this without flagging it. **LCC: do not implement
the magic-link endpoints against this assumption until the founder settles it.**
If LCC builds email magic-link and RCC builds an OTP screen, neither lane finds
out until integration.

It also drags three open questions that one decision would close together:
`design/SCREENS.md` OQ-2 (row 3 "magic link sent" — obsolete or pending?) and
OQ-4 (sign-in drawn twice, on two different auth methods). Note the provenance
line in `docs/OPEN_DECISIONS.md` §Resolved earlier still reads "Postmark magic
link, MSG91 phone OTP phase 2", which is a third position again.

**Not resolved here. It is a founder decision, not a lane decision.**

## Also for LCC

- `sprints/SPRINT_0.md` RCC item 6 says the inventory is **87 rows**. It is
  **119**. The lane built to 119, which is correct; the sprint file is stale on
  that line.
- The client's transcription of the contract is `apps/mobile/src/api/contract.ts`
  — types only, nothing fetches. It is transcribed from
  `docs/API_CONTRACTS.md`, not inferred from the mock. If a shape moves, that
  file is the single place the client reads it, and the move has to be told to
  this lane.
- Three independent citation fields (`verificationState`, `verifiedBySource`,
  `overruledStatus`) are already modelled that way in `contract.ts`, and the
  mock fixture deliberately includes a row that is **`verified` and `set_aside`
  at once** — the case a single enum cannot express. Nothing in S0 renders a
  citation and no badge component exists, which is correct: verified is silent
  and the two rendered states are built in S2 against live data.

---

## Ponytail pass

Lean. Four findings, none urgent.

- `apps/mobile/src/components/Glass.tsx:44` — `glass.blur * 4` silently converts
  a px token into `expo-blur`'s 0–100 `intensity`; sheets land at 96, near the
  ceiling. Not a cut — an undocumented magic number in the component the whole
  chrome layer rests on.
- `apps/mobile/src/components/Pressable.tsx:44` — every pressable registers its
  own `AccessibilityInfo` reduce-motion listener. Reanimated's
  `useReducedMotion()` does it once.
- `contract.ts` / `mock.ts` carry `Briefing`, `DraftDocument` and `Alert` shapes
  no S0 screen consumes. **Keep them.** That is the frozen contract transcribed,
  which is the entire point of the two-lane split. Recorded here so nobody cuts
  them later mistaking them for speculation.
- `@expo-google-fonts/material-symbols` (962KB) lands in the bundle. Not
  imported by us; pulled through `expo-router`. Observation, not a defect.

**Not simplified, correctly:** the verification tokens, `legalText()`, and
`react-native-reanimated` / `react-native-gesture-handler` — both are declared
`peerDependencies` of `expo-router` and must not be removed despite having zero
imports under `src/`.

## Motion — a divergence from the RCC brief, flagged not fixed

The brief requires every animation to run as a Reanimated worklet on the UI
thread, and every animation to be interruptible from current position **and
velocity**.

`Pressable`, `Switch`, `SkeletonCard` and `Toast` use React Native's `Animated`.
`Sheet` has no animation at all — a plain `Modal`, no drag, no
blur-proportional-to-drag. Reanimated 4.5.1, gesture-handler 2.32 and
`react-native-worklets` 0.10.3 are installed and unimported.

Partly defensible: those four set `useNativeDriver: true`, so they are not
JS-driven frame by frame, and `Animated.timing` does resume from the current
*value*. It cannot resume from current *velocity*, and there is no
gesture-driven animation yet to interrupt. The rule bites hardest on the sheet
drag, which is unbuilt.

**Recommendation: migrate the four primitives to Reanimated before any S1 screen
is built on them.** Four files now; every animated screen later. Not done here —
it is a foundation decision across the whole client, on primitives that cannot
be verified without a device, and it is not a call one lane takes alone
mid-gate.

---

## How to re-run every check in this report

```bash
cd apps/mobile && npx tsc --noEmit && node scripts/check-hex.mjs
cd apps/admin  && npx tsc --noEmit && npx next build
cd apps/mobile && npx expo export --platform ios --platform android --output-dir /tmp/lawmind-export
```
