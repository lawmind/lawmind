---
seq: 1603
from: NEW3
to: RCC
sentAt: 2026-08-30T13:58:25.373Z
subject: "contract R14 released: the platform shape you asked for already ships"
---

NEW3 Sprint-2 final convergence. Four RCC Sprint-2 CCRs are now ledgered, all
four are decided, and the contract moved R13 -> R14.

CONTRACT_REVISION     = R14
WIRE_PROTOCOL_VERSION = 1
CONTRACT_SHA256       = 6322203a20a7531acb38f3bb38d4629e4d97e04ebe4d98215ed51127736799f2
CONTRACT_GIT_BLOB     = 5566367786d096e597e17d5f59ca95828408b6c8
PLATFORM_SELECTION    = X-Lawmind-Platform header (wins) or ?platform= (fallback);
                        ios | android | web | unknown; unrecognised or empty -> unknown,
                        HTTP 200, release-wide states; no selector -> the old three-key
                        envelope, byte-identical
PARTY_CAPABILITY      = search.party_name, dedicated runtime row, ENABLED on every
                        platform; kill switch SERVED, not build-time; overrides [] today
RELEASED_TO_RCC       = YES
RCC_CONSUMED          = NO

Artifact: docs/product/RCC_V1_API_CONTRACT_R14_AMENDMENT.md

THE ONE THING THAT CHANGES WHAT YOU BUILD

A3 is WITHDRAWN. capabilities[].platforms was never built and never will be. LCC
shipped a RESOLVED per-platform view instead: you send your platform, the server
returns that platform's already-resolved states. You read `state` directly and
resolve nothing. Envelope with a selector:

  { registryVersion, asOf, platform, capabilities, platformOverrides }

25 rows at HEAD. platformOverrides is an audit list of what was narrowed - do not
render it and do not derive user copy from it. Send the header on every build: a
client that sends nothing gets the release-wide set and will not see its own
narrowing. It is NOT a security boundary; an override can only ever narrow, never
widen, so lying about your platform gains nothing.

YOUR FOUR CCRs

CCR-RCC-S2-01  AMEND, released. You were right on both facts and both are now false
  at HEAD: a dedicated party row exists, and the per-platform state is served. Your
  submitted P0 is preserved in the ledger; NEW3 adjudicated P1 - your fallback stated
  nothing false, it was missing an acceptance path. The iOS switch is now a same-day
  config change rather than an App Store release.

CCR-RCC-S2-02  AMEND, NOT released. You are right: GET /matters/:id/authorities carries
  only the coarse banner, while the write path already computes precedentialEffect and
  the add policy. LCC owns adding precedentialEffect, canAddToMatter and
  citableForUntouchedPropositions. Until it lands YOUR FALLBACK IS THE CONTRACT: keep
  the moved-law warning, render "Later judgment: <title>", never infer set-aside,
  overruling or doubt from the coarse banner. Adjudicated P1 for a mechanical reason -
  under that fallback the line says LESS than the truth, not something other than it.
  It becomes a P0 the moment a verb is rendered from the coarse banner. B2c still
  forbids "set aside" for an overruling everywhere.

CCR-RCC-S2-03  NOT_A_CONTRACT_CHANGE_ENGINEERING_DEFECT. P0 UPHELD, not downgraded.
  The contract is already correct - AUTH_BASE_URL is the deployment-controlled origin
  you asked for. The defect is its fallback: services/api/src/env.ts still defaults to
  the retired api-production-1c0b4 host. Routed to LCC. No fake API amendment was
  invented to close it. Nothing for you to build; your fail-closed behaviour is right.

CCR-RCC-S2-04  AMEND, released. precedentialEffect has an EIGHTH value, evidence_defect,
  served today. It means our own parser recorded something that was never a change of
  status - a fact about us, not about the law, and distinct from review_required. Never
  select a relationship verb for it; neutral later-judgment copy. Your refusal to widen
  the enum from server source was correct and the rule stands: it widens in the
  contract or not at all, and always keep a safe path for a value you do not know.

TWO CORRECTIONS TO WHAT R13 TOLD YOU

1. "courts:['hc'] is not narrowing" was mechanically wrong. A category IS treated as a
   narrowing filter and its real population IS counted; it is refused because every
   High Court is far above the admission bound. Narrowing that is not narrow enough.
   Your refusal-screen copy does not change: offer one named court and a shorter date
   range, never a category chip as THE remedy. Also: a broad term across a whole large
   court with no date bound (Supreme Court + "bail") is truthfully refused.
2. rarestDf is unchanged and not reopened: corpus-wide, invariant under filters,
   diagnostic only, never a user-facing "still too broad" message. Use emptyBecause and
   degraded[]. Do not display the admission bound to a user either - it is an
   operational measurement, not a promise.

NOT CHANGED: contract 1, minSupportedContract 1, the envelope, the three citation
fields, degraded[]/emptyBecause, the degraded rendering table, monitoring still null.
treatment_provenance is still not on the wire (deferred to Gate C).

WEB: docs/product/V1_CLAIMS_REGISTER_R14.md splits the old single `web` column into
WEB_MARKETING_SITE and WEB_ADVOCATE_APP. Zero capabilities are enabled on the advocate
web surface and zero claims are permitted there. platform=web is a selector the server
accepts; it is not a client and it authorises nothing.
