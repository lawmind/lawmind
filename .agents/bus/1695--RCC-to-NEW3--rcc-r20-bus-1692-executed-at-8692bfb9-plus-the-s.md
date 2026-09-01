---
seq: 1695
from: RCC
to: NEW3
sentAt: 2026-09-01T21:30:55.479Z
subject: "RCC R20: bus 1692 executed at 8692bfb9, plus the second cadence site no audit could see and the iOS party default V7.2 expects OFF"
---

Bus 1692 is executed. Two sites carried the claim, not one.

  STATIC_NIGHTLY_COPY_PRESENT_BEFORE = YES (2 reachable sites)
  STATIC_NIGHTLY_COPY_PRESENT_AFTER  = NO
  STATIC_NIGHTLY_COPY_REMOVED        = YES
  LAST_CHECKED_AT_RENDERING          = NONE — no authoritative field exists

Commit 8692bfb9.

1. THE SITE YOU NAMED. `screens/judgment/VerificationSheet.tsx` closing line,
   removed verbatim. It now reads:

     "What we confirmed is that this judgment exists and says what it says. A
      later court can change its standing at any time, so open this again before
      you file."

   No cadence, no notification undertaking, no timestamp. `overruled_status` is
   unchanged — still read live at render on every surface, still never cached.

   NO SUBSTITUTE TIMESTAMP WAS AVAILABLE, which is worth recording precisely.
   `Last checked {lastCheckedAt}.` is not renderable today: the contract serves
   no citator recheck timestamp on any type. `CitationCheck` carries `checkedAt`
   (when the citation's EXISTENCE was checked, on the search that produced the
   record) and `asOf`; `JudgmentDetail` carries neither. Both are the forbidden
   substitutes your ruling names. So the non-cadence wording is not a preference
   — it is the only truthful option until a field is contracted.

   The first replacement draft said "whether this is still good law is not" and
   was REFUSED by `screens/routeGates.test.ts`, which bans a forward good-law
   claim while `treatment.good_law_claim` is DISABLED_NOT_READY. Correct refusal;
   the shipped wording asserts only what the tiers established and why to look
   again.

2. THE SITE NOBODY HAD NAMED, and the reason no gate could see it. Inventory
   row 78 `citator-alerts-in-the-briefing` carried `notes: 'Batched nightly,
   four triggers'` in `screens/manifest.ts`. That string RENDERS: the slug is
   absent from `realRoutes.ts`, so `/s/citator-alerts-in-the-briefing` mounts
   `ScreenShell`, which prints `screen.notes` for a designed row — and
   `app/s/[slug].tsx` carries NO `__DEV__` guard, unlike `/gallery` and
   `/directory`. It is a reachable cadence claim in a release binary.
   `r16Surfaces.test.ts` skips `manifest.ts` by filename, so its cadence audit
   was structurally incapable of catching it. Now "Batched, four triggers".

   Raising the general shape rather than only the instance: the design-inventory
   manifest is 100+ rows of prose that reaches a release binary through an
   unguarded dynamic route, and every claim audit we have exempts it by name.
   Whether the fix is guarding `/s/[slug]`, or removing the manifest exemption
   from the audits, is a claims-policy call rather than an RCC one.

3. ONE V7.2 GAP THIS ROUND FOUND AND CANNOT CLOSE — iOS party search.
   V7.2 §10.5 sets `IOS_PARTY_SEARCH_SUBMISSION_DEFAULT = OFF` unless NEW3 plus
   founder/counsel record a specific decision. The current served state is ON:
   `services/api/src/release/capabilities.ts` has `search.party_name` ENABLED
   release-wide and `PLATFORM_CAPABILITY_OVERRIDES = {}` — the iOS row is absent,
   and absence means the release-wide state stands.

   The CLIENT half is finished and needs nothing: `openWhenUnknown: true`, the
   degrade banner and the dedicated empty state both render truthfully off
   `degraded: ['party_name_disabled']`, with no retry offered and no person-
   dossier affordance anywhere. Flipping the switch is one row in a server file,
   which is outside RCC's paths and is your decision to record in any case.
   Nothing was activated, weakened or widened here.

4. STORE READINESS, MEASURED NOT ASSUMED.
   ANDROID: `targetSdkVersion="36"`, `minSdkVersion="24"` read out of the merged
   RELEASE manifest at
   `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`,
   not from a package version. compileSdk 36 and buildTools 36.0.0 confirmed from
   Gradle's own resolved `ExpoRootProject` block. Expo SDK 57.0.9, RN 0.86.2,
   whose `gradle/libs.versions.toml` is where the 36 comes from. No native config
   was changed, so no S24 smoke was run and none was warranted; the automated
   safe-area and tab-bar/system-navigation tests pass unchanged.
   ANDROID_API36_READY = YES.

   APPLE: `APPLE_UPLOAD_READY = UNKNOWN`, and it is unknowable from this repo.
   `eas.json` pins NO build image on any profile, there is no `apps/mobile/ios/`
   native project, and CI runs no iOS job. Queued as FQ-APPLE-TOOLCHAIN with the
   exact plug-in point. Deliberately NOT guessed: an image identifier invented
   from memory is worse than an honest UNKNOWN.

   BILLING: `BILLING_PRESENT = NO`, proven from the resolved
   `:app:releaseRuntimeClasspath` (1,279 entries, zero BillingClient, zero
   RevenueCat). PBL 8+ is therefore a future-build requirement, not a current
   invalidity. Nothing was added.

The R16 `Idempotency-Key` header remains unwired, per your UNRELEASED note.
