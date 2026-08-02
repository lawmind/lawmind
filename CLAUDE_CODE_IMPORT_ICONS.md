# CLAUDE CODE — IMPORT DESIGN BUNDLE + ICON DECISION

---

## 1 — Import the new design bundle

Standard import. Same process as last time.

Delete `design/screens/` contents, place the new bundle, verify against the
manifest — report renames and omissions, expect zero. Do not import `uploads/`;
it carries stale duplicates of `DESIGN_SYSTEM.md` and `SCREENS.md` that will sit
beside the authoritative ones.

Re-apply the `v1-` rename if the bundle ships `14-admin-enrolment-queue.png` or
`16-admin-llm-spend-routing.png` unprefixed again. Verify byte-identical to the
existing `v1-` files before renaming.

Six things were requested. Confirm which landed and which already existed:

1. **Renders 33 and 34 re-rendered** without the retired green VERIFIED badge.
   These are blocking the marketing site screenshots — confirm they now match the
   silence rule.
2. **Tier names → Practice / Chamber / Expert.** Update `PRODUCT_DECISIONS.md`,
   `PRD.md` and the paywall spec to match. The site names win; the docs move.
   Report how the Chamber-vs-chambers naming collision was resolved.
3. **Multi-seat row** — no price, no buy button, "Talk to us".
4. **Founding offer on the paywall** — "Founding advocates keep 50% off,
   permanently. First 5,000 only." **No "three months free"** — that stays out
   until the briefing cost per user is computed from real beta usage. Record that
   condition in `docs/COMPETITIVE.md`.
5. **Admin routing with a data-class axis.** If it landed, OD-6's design gap
   closes — update `docs/OPEN_DECISIONS.md`.
6. **Legal dictionary, court rules reader, court fee calculator.**

Then reconcile `design/SCREENS.md` and `design/DESIGN_SYSTEM.md` against what
actually shipped. Screens are authority; docs get corrected to them.

---

## 2 — Icons: evaluate Reicon, do not rip out Lucide

**https://reicon.dev/icons** — 3,900+ open-source SVG icons in Outline, Filled and
Duotone weights, MIT licensed. Roughly double Lucide's count, and duotone is a
weight Lucide does not offer.

**Investigate before changing anything:**

- Does Reicon ship a React Native package, or is it SVG download only? I could not
  confirm this. If it is downloads only, integration is static SVGs through
  `react-native-svg` — workable, but a different pattern from an npm import.
- What is the actual repository, and is it maintained? Check stars, commit
  recency, issue count. We are one maintainer deep on `bharat-courts` already; do
  not add a second bus-factor-of-one dependency without knowing.
- Bundle size impact if it is a package. Lucide tree-shakes per icon — confirm
  Reicon does too, or we ship 3,900 icons to use forty.
- Stroke weight. The design system specifies 1.5px Lucide. If Reicon's outline
  weight differs, icons will look inconsistent beside the ones already placed.

**My recommendation, unless your investigation contradicts it:**

Keep Lucide as the base. It is installed, working, named in `DESIGN_SYSTEM.md`, and
`react-native-svg` survives only as its declared peer — the dependency you nearly
removed last week. Do not disturb that.

Use Reicon **to fill gaps**: legal-specific iconography Lucide lacks. Court, gavel
substitute, seal, stamp, bare act, cause list, limitation, adjournment. Bundle
those as static SVGs in `apps/mobile/assets/icons/`.

If your investigation shows Reicon has a clean tree-shaking RN package with a
matching 1.5px outline weight, a full swap is defensible — but propose it and stop
rather than doing it. Swapping an icon library mid-build touches every screen.

Either way: record the decision, the licence and the reasoning in
`docs/OSS_STACK.md`, and update the iconography line in `design/DESIGN_SYSTEM.md`.

---

## 3 — Then

Run the cross-reference checker and both hooks. Run `/ponytail-review` on the diff.

Report: what the bundle changed, which of the six already existed, and your icon
finding with a recommendation.

Do not scaffold. S1 is a separate session with LCC and RCC.
