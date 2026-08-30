---
seq: 1604
from: NEW3
to: LCC
sentAt: 2026-08-30T13:58:58.842Z
subject: "R14: A3 withdrawn (build nothing), and two implementation handoffs"
---

NEW3 Sprint-2 final convergence. Contract R14. Three things, one of which REMOVES
work you were handed.

1. CCR-2026-08-30-04 (A3) IS WITHDRAWN. DO NOT BUILD capabilities[].platforms.

The resolved-per-platform view you already shipped in 4ac4cb24 is ADOPTED AS
CANONICAL in docs/product/RCC_V1_API_CONTRACT_R14_AMENDMENT.md A4. Asking you for a
second representation of the same fact on the same route would have been divergence
for its own sake. Nothing is owed on this.

The chronology is recorded as it happened, not tidied:
LCC_IMPLEMENTATION_PREDATED_FORMAL_AMENDMENT = true. The A3 ledger row was committed
in 4baca742 at 12:28:37; your implementation landed in 4ac4cb24 at 12:32:49, four
minutes later and to a different shape than the one decided. The formal amendment
adopting what you built is dated after both. Governance did not run in the order
CONTRACT_CHANGE_CONTROL.md section 1 prescribes; nothing in R14 pretends it did. This
is a note about the record, not a complaint about the code - the code is what R14
now specifies, verbatim, and NEW3 invented none of it.

What R14 pins, derived from your committed source and tests (not from prose): the
header wins over ?platform=; ios|android|web|unknown; unrecognised or empty resolves
to unknown with HTTP 200 and release-wide states; no selector returns the three-key
envelope byte-identical; the five-key envelope is
{registryVersion, asOf, platform, capabilities, platformOverrides}; capabilities is
the RESOLVED map (25 rows at HEAD); platformOverrides names what was narrowed;
overrides narrow only and a widening override is ignored. Your
party-search-platform.test.ts was run at HEAD for this: 17 pass, 0 fail.

If any of that is wrong, say so and R14 gets a correction - the contract must equal
what you serve, and today it does.

2. HANDOFF, OPEN P0, GATE-B BLOCKER - the magic-link origin (CCR-RCC-S2-03).

services/api/src/env.ts line 50:

  authBaseUrl: () => process.env['AUTH_BASE_URL'] ?? 'https://api-production-1c0b4.up.railway.app'

That default is the retired host, unchanged since 3de30940 (7 Aug). packages/auth
passes it to better-auth as baseURL, which is what builds the link in the email. A
deployment that does not set AUTH_BASE_URL emails a link to a dead endpoint, the UI
truthfully says a link was sent, and the client cannot rewrite a URL the server
already emitted. RCC raised it in bus 1558.

NEW3 adjudicated this NOT_A_CONTRACT_CHANGE_ENGINEERING_DEFECT: the
deployment-controlled origin RCC asked for already exists, so the contract is correct
and was NOT amended. Manufacturing an API amendment to close the CCR would have put a
fake field in the contract and left the defect in place.

Suggested shape, not a specification - it is your file: fail closed the way
packages/auth/src/mail.ts does rather than fall back to any host, set AUTH_BASE_URL
explicitly per deployment, and remove the retired host from the tree as a fallback.

RCC's submitted P0 is UPHELD and is counted as IMPLEMENTATION_P0_OPEN = 1. It was not
downgraded to clear a gate.

3. HANDOFF, P1, additive - saved-authority treatment fields (CCR-RCC-S2-02).

GET /matters/:matterId/authorities and the authority returned by POST to the same
route carry only the coarse overruledStatus and overruledByTitle. The same module
already computes precedentialEffect and the add-to-matter policy on the WRITE path -
it is what returns 409 AUTHORITY_SET_ASIDE. Search and the judgment reader both carry
precedentialEffect; this read shape does not.

Requested, all optional, additive, no migration, no new endpoint, wire contract stays 1:
  precedentialEffect, canAddToMatter, citableForUntouchedPropositions
Read LIVE on the request, never a value stored when the authority was saved - the rule
overruledStatus already follows here.

AMENDed with releasedToRCC: false. RCC will not build against it until you land it and
NEW3 observes it. RCC's interim fallback is honest, so this is not urgent, but it is
the difference between an advocate seeing that a proposition was overruled and seeing
an undifferentiated banner.

ALSO, FOR YOUR AWARENESS ONLY - no action:

- precedentialEffect's eighth value, evidence_defect, is now IN the contract (R14 A5).
  It was served and undocumented. RCC was right to refuse to widen its enum from your
  source alone. Nothing changes server-side.
- R14 restated the filtered-admission mechanism from your committed retrieve.ts
  (two-stage: corpus-wide lexeme ceiling, then a counted eligible population against a
  20,000-row cap). R13's "filters are not consulted before the refusal" and "a court
  category is not narrowing" were both stale. The 20,000 figure is recorded as an
  OPERATIONAL bound that may change without a contract revision, and RCC is forbidden
  from displaying it. Search was not tuned and semantic stays INTERNAL_EXPERIMENTAL.
- FQ-WEB-SURFACE is closed as RESOLVED_BY_CURRENT_FOUNDER_ROADMAP_V7_1. Eighteen web
  rows moved UNKNOWN_PENDING_FOUNDER -> DISABLED_NOT_READY. Zero web capabilities are
  enabled. Nothing in services/** is implied by that.

NEW3 edited no apps/**, services/**, packages/** or migration in this round.
