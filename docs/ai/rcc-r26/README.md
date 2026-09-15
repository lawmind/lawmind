# RCC R26 - current-v1 client truth, and the eight routes a fold did not cover

`HEAD_START = c36c853f`. `INTEGRATION_BASE = 94950462` (LCC R29, landed mid-round).
Round: current-product delta, UI/UX truth, physical device, store-client readiness.

> **Re-anchored mid-round, and it changed the fix.** This round began against
> `c36c853f`, where eight server call sites answered an absent judgment with
> `404 NOT_FOUND` *"no judgment with that id"*. While the client work was in
> progress LCC R29 landed `94950462` and closed the server half: all eight now
> answer `CORPUS_TARGET_UNAVAILABLE` (409 write / 404 read) with a truthful
> message and `details.availability = 'corpus_unavailable'`.
>
> That is not a reason to drop the client fix, and it did change it. A client
> keyed only on the old shape would have classified an R29 corpus refusal as a
> transport failure and told the advocate *"something went wrong on our side"* —
> blaming us for a release fact. The fold now recognises **both** wires, and the
> legacy one is not dead code: a shipped binary outlives a deploy, so a phone in
> a rolling release still meets `NOT_FOUND`.

## What this round was told to check, and what checking it found

LCC bus 1757 §2 named two routes that still answer an absent judgment with the
sentence R17 §1 forbids. LCC bus 1758 corrected that to **eight call sites across
seven routes** and asked RCC one question: *"whether every one of those seven
routes actually passes through the fold on your side, because I previously told
you the exposure was two."*

**The answer is no, and it was never close to yes.** `citation/saveAuthorityOutcome.ts`
narrows exactly one response type - `AddAuthorityResponse` - and nothing else in
the client calls it. Four render sites printed `res.error.message` verbatim at `c36c853f`:

| render site | route |
| --- | --- |
| `screens/judgment/AuthoritiesPanel.tsx:60` | `GET /judgments/:id/authorities` |
| `screens/precedent/PrecedentScreen.tsx:69` | `GET /judgments/:id/treatment` |
| `screens/precedent/PrecedentScreen.tsx:86` | `GET /judgments/:id/graph` |
| `screens/judgment/UnverifiedCitationScreen.tsx:158` | `POST /verify/confirm` |

So an advocate opening the citation network of a judgment the active corpus
generation does not carry would have read *"no judgment with that id"* - a claim
about the law, made by us, which after a corpus rollback is simply false.

## The fix is one layer lower than the question implied

`api/corpusAbsence.ts` is the rule; `api/client.ts#once()` applies it. `once()` is
the single point every response in this client passes through, so the fold covers
all eight routes and every route added later. The alternative - patching three
screens - fixes the three screens that exist today and leaves the invariant
depending on whoever writes the fourth.

It recognises two wires: `CORPUS_TARGET_UNAVAILABLE` (LCC R29, current) and
`NOT_FOUND` whose message names a JUDGMENT (pre-R29, still reachable from any
environment that has not taken R29). The R29 message is truthful and is still
replaced, for the reason `saveAuthorityOutcome.ts` already gives about the R17 §1
write: this client renders one sentence for this state on every surface, and a
server whose wording drifts must not be able to move what an advocate reads about
the law.

Narrow in the same direction the existing fold is narrow: `NOT_FOUND` *"no matter with that id"* is true and
actionable and is untouched; so is the `set_aside` 409, whose message names the
replacement judgment and is the one refusal Lawmind makes on purpose. **The code
is not rewritten, only the message** - callers branch on `NOT_FOUND`
(`state/outbox.ts` classifies it NON_RETRYABLE) and a code this client invented
would be a contract this client invented.

## The second defect, which no bus message named

The reader's own failure screen asserted two things it cannot know:

> "It is in the corpus - search found it. Something went wrong on our side
> fetching the full text. The search result is still accurate."

`JudgmentScreen` is reached from a deep link, a saved authority, the authorities
panel, a briefing and a matter. **There may have been no search**, and no result
to still be accurate. And after LCC R28 the read goes to the CORPUS role, so the
release genuinely may not carry it - which makes "it is in the corpus" false
exactly when an advocate most needs it to be true.

`missing` is now `null | 'corpus_absent' | 'fetch_failed'`. The corpus branch says
what the release does not hold; the transport branch says what WE could not do,
and claims nothing about the corpus. The back control is labelled `Back` rather
than `Back to results`, for the same reason.

## Verification - observed, not inferred

| what | result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm test` | **111 suites / 1,273 tests / 0 failures** |
| `pnpm test:e2e` (live API + live Postgres) | **2 suites / 24 tests / 0 failures** |
| `pnpm check:hex` | PASS - no colour literal outside `theme/tokens.ts` |
| `pnpm check:sunlight` | PASS - every shipped pair meets WCAG AA; leading ratio holds at 1x / 1.3x / 2x |
| `node scripts/check-design-rules.mjs` | PASS - no new violations |

The e2e run is the one that matters for a transport change: it drives the real
`api/client.ts` against a real server across two corpus generations, so R17's
write/read/recovery lifecycle and `identity_only` deletion are re-proved **with
the fold in place**, not merely unbroken in a mock.

The 24th test is new and is this round's central claim, proved rather than
argued: with generation B served, `GET /judgments/:id` for a judgment B does not
carry comes back `CORPUS_TARGET_UNAVAILABLE` from the real server and the real
client hands the caller **this client's sentence**, not the server's.

**A harness defect found on the way, recorded because it looked like a product
defect.** The first run of that assertion returned `500 INTERNAL`, which reads
exactly like "the loudest of LCC R29's eight sites cannot reach its own refusal
under a split". It was not. `e2e/server/boot.mts` built `judgments` with only
the columns the R17 §1 WRITE path reads, so `getJudgment`'s SELECT raised
`column "bench" does not exist` before `if (!row)` could run. Ten columns added;
the refusal path now runs. The SUCCESS path still answers 500 in this harness —
hydration reads paragraph and citation-check tables it does not build — and both
the harness and the spec now say so in place, so a passing refusal is not read as
a working reader. **No claim about the server was made on that evidence.**

### The shipped binary

`expo export --platform android` under `NODE_ENV=production`, read back in both
ASCII and UTF-16LE (Hermes strings are UTF-16 and an ASCII-only grep of a `.hbc`
has reported shipped copy as absent here before). Bundle
`entry-850aee9dc2398f6e071e000a8d016b94.hbc`, 6,636,279 bytes.

```
PRESENT   "The corpus release this app is reading does not contain this judgment"
PRESENT   "This judgment is not in the release we are reading"
PRESENT   "Something went wrong on our side fetching the full text"
PRESENT   "Already saved to this matter. The corpus release"    "Request account deletion"
PRESENT   "#747064"
ABSENT    "It is in the corpus"   "search found it"   "The search result is still accurate"
ABSENT    "Back to results"       "#8A8578"
ABSENT    "rcc-e2e-"   "lawmind_e2e_rcc"   "127.0.0.1:4319"
```

The last line proves the e2e harness ships in no bundle. Export directory deleted
after reading.

`ANDROID_TARGET_SDK = 36`, read from Gradle's own build output
(`node_modules/expo/android/build/intermediates/.../release.xml`,
`targetSdkVersion="36.0"`), not from a package version or a config guess.

## What was checked and needed nothing

- **Search truth.** `screens/search/searchTruth.ts` distinguishes all six shapes
  and `SearchScreen` renders four distinct empty states. A confirmed zero, a
  refusal (`sparse_unbounded`), an unfinished search (`sparse_timeout` arrives in
  `degraded[]`) and `coverage_unknown` each read differently, and none of them
  says "there is no law on this". `total` is already `total?: number` on the
  client type and `SearchScreen` reads it as `?? null`, so LCC R27 §2's removal
  of `total` from the refusal shapes needed no change.
- **iOS party-name search.** Server-enforced OFF:
  `PLATFORM_CAPABILITY_OVERRIDES.ios['search.party_name'] = DISABLED`, activated
  2026-09-02. The client offers no person-dossier affordance anywhere and renders
  the degrade truthfully off `degraded: ['party_name_disabled']`.
- **Monitoring, statute correspondence, good-law claim.** All
  `DISABLED_NOT_READY` with `openWhenUnknown: false` in `state/capabilities.ts`.
  No rendered string in `apps/mobile/src` claims a judgment is good law, and no
  cadence promise ("rechecked nightly" or equivalent) survives - RCC R20 removed
  both sites and they have not returned.
- **Reduced motion.** `useReducedMotion` is consumed in `FadeRise`, `Pressable`
  and `Sheet`, including the gesture enable flag.
- **Touch targets.** `components/Pressable.tsx` enforces
  `minWidth/minHeight: size.touch` on the host node, so it cannot be forgotten
  per call site.

## The one accessibility gap found

`components/SettingsRow.tsx` had no `accessibilityRole`. The row's text is
announced either way - `RNPressable` is `accessible` by default - but nothing
told a screen reader the row can be activated, so "Delete account" was read out
exactly as the static rows beside it. It is a shared component, so the gap was on
every settings surface at once. Now `accessibilityRole="button"`.

An audit of all 115 `<Pressable>` sites found no other icon-only control without
an accessible name; the two the scan flagged were false positives (both wrap a
`View` containing `<Text>`, and one already declares the role).

## LCC's handback, closed

LCC bus 1757 §5: `design/DESIGN_SYSTEM.md` and `scripts/check-design-rules.mjs`
still named `#8A8578` after the shipped `ink-faint` moved to `#747064` on
2 September 2026. Both now name the shipped value. `#8A8578` stays in the
guard's palette allowlist deliberately - the 18 renders in `design/screens` were
drawn against it and are visual-language references, not capability truth;
rewriting them would be a mass edit to make a guard tidy.

## Caveats, stated rather than omitted

- **`DEVICE = PENDING`.** `adb devices -l` was run once and listed nothing. No
  physical matrix row is claimed and none is inferred from Jest, TypeScript or an
  export build.
- **`EXTERNAL_DELETE_WEB = BLOCKED_OTHER_REPOSITORY`** — and this is a
  **CORRECTION to what this round first reported.** The round initially recorded
  `PUBLIC_WEB_PRESENT = NO`, following
  `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md`, `FOUNDER_QUEUE.md` FQ-SITE and
  `WEBSITE_PRODUCT_SPEC_V1.md` §0, all of which say `lawmind.co` "serves
  nothing". Once the GitHub CLI was authenticated, ten seconds of checking
  refuted it:

  ```
  lawmind/lawmind-site        on the org — Next.js 16 App Router, 12 routes
  https://lawmind.co          200, Vercel (bom1), real site
  https://lawmind.co/privacy  200        https://lawmind.co/terms    200
  https://lawmind.co/delete-account      404   <- the only thing missing
  ```

  The blocker is **one route in a sibling repository**, not a missing website,
  not a domain, and not money. `apps/` still holds only `mobile` and `admin`, so
  nothing was built here and no mobile-hosted HTML route was invented — the
  right conclusion from the wrong premise. Owner is NEW3 / the website lane by
  its own bus 1753 ruling; told at bus 1767. `FOUNDER_QUEUE.md` **FQ-DELETE-WEB**
  is corrected in place and is no longer a founder item.

  **The lesson is the one this repository already has a memory about.** `apps/`
  is the right place to look for an app in this repository and the wrong place
  to look for a website that was never going to live here. A finding repeated
  across three documents and two rounds is not evidence; a `curl` is.
- **`APPLE_PRODUCTION_BUILD_PROOF = PENDING`.** No production build was run and
  none was paid for. The `eas.json` production image
  (`macos-tahoe-26.5-xcode-26.6`) is unchanged and guarded by
  `src/config/easBuildImage.test.ts`.
- **The baseline had two contention flakes and this round's final run did not.**
  `CauseListScreen.outcome` and `MatterPicker.pendingSave` each exceeded the
  5,000 ms render timeout on the first full run, alongside other work on the box,
  and passed in isolation (7/7). The final full run was clean at 111/111. Recorded
  rather than quietly re-run away.
