# LAWMIND v7.2 — DEEP RESEARCH & ADVERSARIAL REVIEW MEMO
**Date:** 1 September 2026

This memo records why v7.2 changes the roadmap. It separates verified repository evidence, primary external policy/engineering sources, competitor signals, and rejected hypotheses.

---

# 1. METHOD

The review used four evidence layers:

1. exact v7.1 master roadmap and Sprint Prompts v2;
2. latest four lane outputs supplied by the founder;
3. primary current platform/engineering sources;
4. competitor/product and empirical legal-AI research.

The review deliberately searched for evidence that would *contradict* the initial plan.

Examples:
- whether the 29 ambiguous citation rows truly needed to block all 540 safe rows;
- whether the shared citation regex should be relaxed;
- whether local sparse SQL actually explains the 15.2 s device event;
- whether FIFTH should be awakened for intermediate audits;
- whether v7.1 store deadlines were still current;
- whether a per-table idempotency column was the right architecture;
- whether competitor feature breadth justified scope expansion.

---

# 2. INTERNAL AUTHORITY REVIEW

v7.1 remains strong on the core architecture:

- UNKNOWN/ambiguity rules;
- citation false-pin hold;
- HNSW only after reproducible snapshot identity;
- formal FIFTH gates;
- remote data-plane separation;
- no public semantic v1;
- no generic AI chat;
- monitoring 12-condition gate.

The major weakness exposed since v7.1 is execution/control-plane structure, not the legal-truth philosophy.

---

# 3. STORE POLICY CHANGES THAT MAKE v7.1 STALE

## Google target API

Google Play's current official requirement says new apps and updates submitted from 31 August 2026 must target Android 16 / API 36 or higher for ordinary Android mobile apps.

Source:
https://support.google.com/googleplay/android-developer/answer/11926878

Roadmap consequence:
API36 cannot wait until Sprint4. Verify it immediately in the actual release build.

## Google Play Billing

Official deprecation table:
PBL7 ordinary new-app/update deadline: 31 Aug 2026.
PBL8: 31 Aug 2027.
PBL9: 31 Aug 2028.

Source:
https://developer.android.com/google/play/billing/deprecation-faq

Roadmap consequence:
do not plan a new PBL7 build. If billing ships, use supported PBL8+ and prove the transitive release dependency.

## Apple SDK

Apple says App Store Connect uploads since 28 April 2026 must use Xcode26+ and the iOS26 SDK+.

Sources:
https://developer.apple.com/news/upcoming-requirements/
https://developer.apple.com/app-store/submitting/

Roadmap consequence:
actual production EAS/native build image becomes a current preflight.

## Expo compatibility

Expo's current SDK reference shows SDK54+ can target Android API36; Expo also documents Xcode26 EAS support for SDK54/55.

Sources:
https://docs.expo.dev/versions/latest/
https://expo.dev/blog/app-store-connect-minimum-sdk-26

Roadmap consequence:
this is evidence that an upgrade may be bounded, not permission to infer the repo is compliant. The actual LawMind build config must be inspected.

---

# 4. APPLE PRIVACY / PARTY SEARCH

Apple App Review Guideline 5.1.1(viii) currently states that apps compiling personal information from sources not directly from the user, even public databases, are not permitted.

Source:
https://developer.apple.com/app-store/review/guidelines/

This is broader than "don't make a person dossier."

Case-first search remains the right product design, but it is not a store-acceptance guarantee.

Roadmap change:
submission candidate defaults iOS party-name search OFF unless an explicit NEW3/founder/counsel decision records why ON is acceptable.

Exact case/CNR/citation research remains available.

Apple also requires in-app account deletion for apps with account creation.

Source:
https://developer.apple.com/support/offering-account-deletion-in-your-app/

---

# 5. DPDP TIMELINE

MeitY's official 13 Nov 2025 commencement notification schedules major DPDP Act provisions 18 months later.

Source:
https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf

That points to 13 May 2027 for the major provisions listed in clause (c).

The DPDP Rules are also phased.

Source:
https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

Roadmap consequence:
October 2026 public launch precedes major commencement, but privacy basics remain worth building now because Apple deletion is already binding and isolation/erasure are expensive to retrofit.

---

# 6. IDEMPOTENCY — WHY R16 SHOULD BE GENERIC

AWS documents the exact failure mode LawMind reproduced: a mutating request may time out even though it succeeded, and retries can duplicate the operation. AWS uses client tokens; same token/same parameters is safe, same token/different parameters is a mismatch.

Source:
https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html

Stripe uses client-generated idempotency keys and compares repeated request parameters.

Source:
https://docs.stripe.com/api/idempotent_requests

The IETF `Idempotency-Key` draft expired in April 2026 and is not an active RFC.

Source:
https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/

Roadmap consequence:
LawMind may use the well-established `Idempotency-Key` convention, but must not call it an HTTP standard.

A generic ledger is preferable to six domain-specific nullable keys because R16 defines idempotency as request metadata across six routes.

Critical invariant:
domain mutation and completed idempotency receipt must be transactionally coupled.

---

# 7. CONTROL-PLANE HEALTH — WHY PID IS NOT ENOUGH

LawMind's own evidence proved `job-health` paged a worker that had produced durable vectors seconds earlier.

Kubernetes' official guidance independently warns that incorrect liveness probes can cause cascading failures and says liveness should indicate unrecoverable failure.

Source:
https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-probes/

Roadmap consequence:
durable progress/receipts outrank wrapper PID cosmetics; UNKNOWN is not restart-safe.

---

# 8. HNSW — WHY PRECHECK + FINAL IS SAFE

pgvector's official project documentation says:
- HNSW trades recall for speed;
- index creation is faster after initial loading;
- build is much faster if graph fits `maintenance_work_mem`;
- do not set memory high enough to exhaust the server;
- progress can be read from `pg_stat_progress_create_index`;
- `ef_search` trades speed vs recall.

Source:
https://github.com/pgvector/pgvector

Roadmap consequence:
v7.1's final HNSW predicate is correct.

The v7.2 change does not weaken it:
run a static PRECHECK at ~75–80% so schema/model/build-predicate/disk issues are fixed *before* the walk finishes, then keep the final four-state integrity gate at completion.

---

# 9. SEARCH — WHAT THE NEW MEASUREMENT DOES AND DOES NOT PROVE

Local LCC measurement:
cold p95 ~1.05s.
Locally dominant sparse CTE ~473ms.
Paragraph fallback not material.

Physical device twice observed server duration ~15.2s.

PostgreSQL's `statement_timeout` is measured from when the command arrives at the server; time waiting in an application connection pool before server execution is a different latency class.

PostgreSQL also documents how BitmapAnd combines indexes and can create extra work; that makes the measured sparse plan a plausible tuning target, but not proof of the 15.2s root cause.

Sources:
https://www.postgresql.org/docs/current/runtime-config-client.html
https://www.postgresql.org/docs/current/indexes-bitmap-scans.html

Roadmap consequence:
before index migration:
measure `pool_wait_ms`, per-arm SQL, degraded reason and total on the environment reproducing the slow event.

Never raise timeout to make the metric disappear.

---

# 10. CITATION CORRECTION — WHY SAFE-SUBSET WINS

R21's independent audit showed:
- many correction rows were independently sound;
- 29 common-order ownership cases were ambiguous;
- malformed manifests could pass preflight.

R22 then produced a 540-row safe subset and quarantined:
- 29 common-order rows;
- 2 unexplained Delhi many→one holder conflicts.

The correct principle is:
ambiguity quarantines the ambiguous population.

It does not justify making known-safe rows wait forever, but known-safe rows still require independent audit and write-time drift protection.

This is why v7.2 introduces Canonical Mutation Protocol v2.

---

# 11. WHY THE SHARED CITATION PARSER SHOULD NOT BECOME MORE PERMISSIVE

R20 fixed a real strict-token bug.

Later evidence showed a different problem:
validly parsed suffixed citations inside court text can be the document's own/common-order page furniture rather than an outgoing authority.

Therefore:
"parse succeeded" and "edge exists" are different propositions.

Roadmap consequence:
- strict user citation-query parser;
- tolerant source citation-span extraction;
- deterministic mention-role/ownership/edge interpretation.

The source scanner is bounded citation work, not broad OCR/ML role classification.

---

# 12. STATUTES — WHY API/UI SHOULD STAY HIDDEN

LCC measured ~905k statute-reference rows but essentially no resolver-confirmed positive relationships.

An empty confirmed response is therefore the honest result.

Research on statute-centric legal QA supports the architectural direction: incomplete statutory context can increase hallucination; structure-aware retrieval and safe abstention matter.

Source:
https://aclanthology.org/2026.acl-long.2112/

Roadmap consequence:
`STATUTE_LINK_RESOLUTION_V1` is a data-truth problem before it is a UI-release problem.

---

# 13. COMPETITOR REVIEW — WHAT CHANGED, AND WHAT DID NOT

## Bharat.Law

Official product pages now position:
- matter/case workspace;
- research trails/bookmarks;
- documents;
- monitoring;
- AI research/drafting;
- connected workflows.

Sources:
https://bharat.law/product
https://bharat.law/product/case-workspace

However, Bharat.Law's own Service Terms tell users to independently verify citations/quotations and acknowledge that court/government data completeness/timeliness depends on upstream publishers.

Source:
https://bharat.law/legal/service-terms

Conclusion:
marketing court-count/latency/zero-fabrication claims are competitive signals, not external benchmarks for LawMind.

## Jhana

Official changelog describes background research that can continue while users navigate away and source persistence/session stability.

Source:
https://jhana.ai/blog/changelog/

## CaseMine

Official guide exposes Search History, bookmarks and task workflow so prior research can be resumed.

Source:
https://www.casemine.com/home/guide

## Indian Kanoon

Official Premium/Terms pages expose NoteIK research topics, query alerts and Prism.

Sources:
https://indiankanoon.org/premium/
https://indiankanoon.org/members/terms/

## SCC / Manupatra

SCC markets AI Pro grounded in SCC's database; Manupatra markets semantic natural-language AI Search.

Sources:
https://www.scconline.com/blog/post/2026/07/30/scc-online-ai-pro-smartest-way-to-legal-solutions/
https://www.manupatra.ai/ai-search-faq

Conclusion:
the market is moving to connected research/matter workflows and AI synthesis.

That does NOT justify adding those features before Gate C.

It does justify shadow-beta measurement of resume/research-context friction.

---

# 14. EMPIRICAL LEGAL-AI EVIDENCE

Stanford's preregistered evaluation found leading proprietary legal RAG tools still produced hallucinations on a material fraction of queries.

Source:
https://law.stanford.edu/publications/hallucination-free-assessing-the-reliability-of-leading-ai-legal-research-tools/

ACL 2026 CaseFacts found unrestricted web search could degrade legal fact-checking by retrieving noisy/non-authoritative precedent.

Source:
https://aclanthology.org/2026.acl-long.785/

ACL 2026 JurisBench found error propagation in end-to-end legal workflows and identified precise statutory grounding as a bottleneck.

Source:
https://aclanthology.org/2026.acl-long.1666/

Conclusion:
LawMind should not respond to competitor AI breadth with a generic chatbot.

If beta proves synthesis is a real workflow exit point, the right experiment is evidence-locked claim generation over verified authority with explicit abstention and claim-to-evidence audit.

---

# 15. REJECTED / MODIFIED INITIAL IDEAS

## Rejected: wake FIFTH for citation/HNSW intermediate work
Reason:
v7.1 explicitly reserves FIFTH for Gate B/C/E and emergency P0 audit.
Replacement:
AUDIT-RO.

## Rejected: force all 29 ambiguous citation rows to resolution
Reason:
would turn uncertainty into pressure to invent identity.
Replacement:
quarantine; independently audit 540 safe rows.

## Rejected: relax shared exact citation parser for TOKEN1TOKEN2
Reason:
source-document mention extraction is a different job from exact user query parsing.
Replacement:
bounded source citation-span scanner later.

## Rejected: add an index immediately for the local BitmapAnd plan
Reason:
local p95 is ~1s and does not reproduce the 15.2s event.
Replacement:
measure pool wait + route phases where the event occurs.

## Rejected: solve annotation idempotency with one annotation column only
Reason:
R16 identified six current-v1 create mutations with the same retry failure class.
Replacement:
generic transactionally coupled idempotency ledger.

## Rejected: trust "re-check every night" because a cron file exists
Reason:
configuration is not deployed runtime observation.
Replacement:
runtime last-check evidence.

## Rejected: leave store target/API checks until Sprint4
Reason:
API36, Xcode26/iOS26 and PBL7 deadlines are already current/past.
Replacement:
immediate store preflight.

## Rejected: enable statute-linked judgments because API/UI exist
Reason:
confirmed relationship data is effectively absent.
Replacement:
resolution pipeline + NEW3 acceptance first.

## Rejected: competitor feature sprint
Reason:
would dilute trust-first v1 and introduce a class of LLM risks already observed empirically.
Replacement:
beta-triggered Research Session and Evidence-Locked Synthesis decisions.

---

# 16. CONFIDENCE / REMAINING UNKNOWN

High-confidence:
- store API/toolchain deadlines;
- Apple account/public-database rules;
- R16 idempotency need;
- control-plane false-page defect;
- R22 safe-subset architecture;
- formal FIFTH policy;
- HNSW final gate ordering.

Still needs repository/runtime measurement:
- actual LawMind targetSdk;
- actual EAS production Xcode image;
- actual current BillingClient if present;
- current HEAD ancestry after four concurrent commits;
- exact cause of the ~15.2s route event;
- current exact NEW1 vector count;
- whether local-v1 acceptance can now turn all required completeness states YES;
- eventual statute-link confirmed population.

These are intentionally gates/prompts, not guessed facts.
