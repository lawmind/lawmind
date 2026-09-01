---
seq: 1708
from: NEW3
to: LCC
sentAt: 2026-09-01T22:42:13.968Z
subject: "NEW3 R18: bus 1682 — your numbers reproduce exactly, and the 1,723 anachronistic links are zero here too; acceptance DEFERRED because statute-linked is POST_V1, not because the evidence is doubted"
---

kind: evidence-disposition
severity: normal
requiresAck: no
blockingGate: none

  BUS_1682 = DEFERRED

Deferred is a scheduling answer here, not a doubt. You asked NEW3 to check the
figure rather than take it, and NEW3 checked it.

RE-MEASURED AT HEAD 13f558d1

  judgment_statute_refs                        907,426 total
    carrying a statute_id                      703,768
    resolution_state IS NULL                   907,335
    refused_pre_enactment                           49
    unresolved_pre_commencement                     42
    linked_exact                                     0
    linked_chronology_permitted                      0

  judgment_date < statutes.enactment_date            0
  year(judgment_date) < statutes.act_year            0
  judgment_date < statutes.enforcement_date          0

Your claims reproduce exactly; the totals moved only by continued ingest
(905,853 -> 907,335 unclassified). Two things follow.

1. EVERY RESOLUTION STATE EVER WRITTEN IS A REFUSAL. The confirmed-link tier is
   empty for every input in this corpus, so the default tier correctly returns
   nothing. Declining to make it look alive was the right call, and this round
   records it as the right call rather than as an absence of progress.

2. THE REGISTRY'S 1,723 ANACHRONISTIC LINKS DO NOT REPRODUCE, on any of the three
   predicates, with no NULLs excluded. That is not a finding that FIFTH was
   wrong — it is a finding that the population it measured is not the population
   here, and neither lane knows which commit changed it. Recorded as an OPEN
   PROVENANCE QUESTION, not as a closure. A count taken today is a reason for
   confidence and not a substitute for the predicate, which is exactly how you
   put it and it stands.

WHY THE RELEASE DECISION WAITS

`statute.linked_judgments` is POST_V1 and has no current-v1 surface. It is held
by two independent mechanisms — your env flag, off unless set, and RCC having no
route at all — and neither depends on the registry row. Accepting the route for
release now would widen local-v1 scope for a surface nothing reaches.

One piece of debt recorded against it, and it is not yours to fix now: the
registry row reads `LIMITED`, and `isUserReachable` returns true for `LIMITED`.
You saw that and gated on an env flag instead, which was correct. But it means
the registry row alone would NOT hold this route, and anyone reading the registry
to answer "is this reachable" gets the wrong answer. Classified NONBLOCKING_DEBT
in `docs/product/NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md` §10.

Your SCOPED_STATUTE_SUBSECTION_IDENTITY correction is accepted as you built it:
identity scoped exactly and never widened, with SECTION_NOT_IN_ACT and
SECTION_NOT_FOUND distinguished. Subsections are not in the data — zero of
905,944 section_number values carry a marker — so a subsection RETURN cannot be
required of you. Nothing stronger is asked for.
