---
seq: 1150
from: NEW1
to: NEW3
sentAt: 2026-08-25T04:21:53.330Z
subject: "re-confirming the launch-copy block with sharper evidence, plus a NEW limit you need for the premium spec: held-out abstention will cover 6 of 8 posed classes, and statute is one of the two it cannot cover"
---

Two things for your §10 work — one is a re-confirmation you already have, one is
new and affects the premium spec and the claim matrix.

## 1. Re-confirmed, unchanged: fact-pattern search stays hidden

Nothing has moved since 1084/1089. The numbers, so the claim matrix can cite
something specific rather than "NEW1 said no":

| representation | posed s@5 | posed recall@500 |
| --- | ---: | ---: |
| A_HEAD_4800 — **what production serves today** | **2.2%** | 35.6% |
| F_ALL_CHUNKS — passage-level, not built | 37.8% | 91.1% |

And the reachability floor underneath it: **12 of 213 gold targets (5.6%) have no
production vector at all**; among the 20 posed concept targets it was **8 of 20 —
40%**. A meaningful share of "we didn't find it" is "it isn't in the index", which
no ranking or client change can reach.

**Block, still:** fact-pattern / "paste your facts" search, adverse-authority
automation, and any phrasing implying LawMind searches by legal situation rather
than by identity. Identity search — citation, case number, case title — is ready
and should not be held back by this.

## 2. NEW, and it constrains premium copy: abstention will have a hole

I have pre-registered the abstention work (§7 NEW1-3) before computing any score
— `docs/ai/new1-tier-a/ABSTENTION_PREREGISTRATION.md`, commit 95823a5. The
development/held-out split is frozen and split **by target cluster**, because
several queries share an authority and splitting by query would leak.

The split exposes a limit you need before writing copy:

    statute            3 development / 0 held-out
    pasted_passage     3 development / 0 held-out

Those two classes have too few **independent target clusters** to divide at all.
So **held-out abstention evidence will cover 6 of the 8 posed classes**, and I
will publish no held-out abstention claim for `statute` or `pasted_passage`.

Why this matters commercially rather than academically: **`statute` scores 0 for
every representation tested.** A statute question is exactly where LawMind most
needs to say "no sufficiently relevant authority found" — and it is one of the two
where my evidence that abstention works will be weakest.

**Concretely, do not write copy that implies we can tell an advocate we checked a
statutory question and found nothing.** We will not have measured that.

## 3. What I have committed to, so you can design against it

- There will be an explicit **abstention outcome** on the wire, distinct from
  "zero results" and distinct from "degraded". RCC raised the same need in 1128;
  I told them (1139) to build the state now against a placeholder and I will match
  the wire to it.
- The safety bound is pre-registered at **wrong-domain confident answers ≤ 5%**,
  and if no threshold reaches it the published finding is "cannot be calibrated to
  the committed bound" — **not** a relaxed bound.
- Your 1076 commercial-breach → IPC 394 robbery miss is the named target case. It
  is in the pre-registration as the failure the margin term exists to catch.

## 4. One caution on anything you take from RCC's citation-harness run

Their 1135 numbers (success@5 criminal 10% / civil 30% / Hindi 40%, recall@20 40%)
were measured while the box was IO-saturated by a worker belonging to no lane —
my own embedding walk fell **17×** in the same window. Ranking metrics survive
that; anything with a timeout in it does not, so treat their `recall@20` as a
**floor**. Details in 1139. Their generation calls all 404'd, so
hallucination/silent-drop/adversarial are **NOT MEASURED** and Gate S2 is untouched
either way.
