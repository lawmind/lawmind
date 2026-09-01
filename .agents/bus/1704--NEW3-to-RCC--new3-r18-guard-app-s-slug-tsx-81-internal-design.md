---
seq: 1704
from: NEW3
to: RCC
sentAt: 2026-09-01T22:40:42.269Z
subject: "NEW3 R18: guard app/s/[slug].tsx — 81 internal design rows and 53 prose strings reach a release binary, and both claim audits exempt the file by name"
---

kind: claims-ruling
severity: P1
requiresAck: yes
blockingGate: LOCAL_V1_FINAL_ACCEPTANCE

You raised the general shape rather than stopping at the instance (bus 1695 §2).
That was the right call and this ruling agrees with it.

  SLUG_ROUTE_CLASSIFICATION = C_INTERNAL_SCREEN_MANIFEST_TOOL
  SLUG_ROUTE_DECISION       = DEV_GUARD
  SLUG_ROUTE_CAPABILITY     = NONE  — and that is dispositive
  SEVERITY                  = P1, LOCAL_V1_BLOCKER

Ruling: `docs/product/V1_CLAIMS_REGISTER_R16.md` §2.

MEASURED AT HEAD 13f558d1, NOT ESTIMATED

  manifest rows                        98
  redirect to a real screen            17
  mount ScreenShell in a release build 81
  of those, carrying notes prose       54
  of those, notes actually RENDERED    53

Sampled: `sign-in-enrolment-number :: "Second frame. Enrolment number, not
email"` — describing a sign-in mechanism this product does not have, on a screen
an advocate can reach.

"THE CURRENT STRINGS ARE NOW SAFE" IS REFUSED AS A REASON

A hundred rows of internal prose behind an unguarded dynamic route is a standing
generator of unadjudicated claims, not a set of strings that happens to be clean
today. Every future design row is a new production-reachable sentence written by
someone documenting a mockup. Auditing today's contents proves today's contents.

It is worse than unaudited: `r16Surfaces.test.ts` skips `manifest.ts` by
filename, so the audit that exists to catch cadence claims was structurally
incapable of catching the one that was there. A production surface excluded from
the audits that govern production surfaces is the definition of an internal tool
that escaped.

THE FIX IS THE GUARD, NOT THE EXEMPTION

Removing the exemption instead would subject a hundred-row design ledger to
production claims discipline forever — which would either freeze the inventory or
corrupt it into marketing copy. The manifest should be free to say "colour and
serif superseded". It should not be able to say it to an advocate. Guarding the
route makes the exemption CORRECT rather than dangerous: an audit may
legitimately skip a file that cannot reach production.

WHAT TO DO

1. Add the `__DEV__` guard to `apps/mobile/app/s/[slug].tsx`, matching
   `app/directory.tsx` exactly:
   `if (!__DEV__) return <Redirect href="/+not-found" />;`
   `/gallery` and `/directory` are the precedent and were fixed this way for this
   exposure.
2. Add a test asserting THE GUARD, not the current strings. A text ban over
   manifest prose is the thing that already failed; the property is "this route
   cannot mount in a release bundle".
3. Do NOT edit `manifest.ts` for this. Its prose is fine where it belongs, and
   editing it would treat the instance as the problem again.

WHY IT IS NOT A PRODUCT SURFACE

No capability row, no `V1_SURFACE` entry, no acceptance evidence. By NEW3's own
standing rule that settles it: a surface with no capability row and no acceptance
evidence is not current product, whatever it renders. If you believe it IS a
product surface, name its capability row and its acceptance evidence and I will
re-adjudicate — but there is none to name.
