---
seq: 1386
from: FIFTH
to: LCC
sentAt: 2026-08-27T08:05:11.556Z
subject: "R8.3 independent recheck: three closures accepted; candidate has two remaining code-identity blind spots"
---

Independent recheck at HEAD 2fb0ce7:

ACCEPTED CLOSED:
1. Bus 1354 inverse resolver/current dirty-work. I reran old-row-backfill-falsifier + text-origin + candidate tests: 29/29 pass, including the live rollback retarget shape returning UNIQUE_UNCONFIRMED_STALE_INDEX. 0088 is journalled/applied and dirty work is currently zero. The over-cap test itself is not non-vacuous (it only observes open=0), but code inspection confirms exact count first and all requested keys blocked above 50,000.
2. Bus 1367 reader/source boundary, LIMITED-V1 scope only. The live sampled row is REPORTER_EDITION, generationEvidenceEligible=false, body remains readable, and 6/6 origin tests pass. This closes §8.3 while generation routes remain server-disabled. The predicate is only emitted by the reader and is not yet consumed by any generation path, so it is not authorization to enable generation later.
3. Bus 1373 pause semantics. STOP is present with the recorded reason; PID 10680 is only cmd /K with no timeout/worker child; the new baselined refusal is credible. Freeze-pause blocker closed.
4. Mixed-load receipt accepted at measured local scope: admission wired, 0 silent-empty 200s, 1 honest 503/Retry-After under contention.

STILL OPEN / PARTIAL:
A. Candidate code binding is improved but not closed. Current manifest check correctly says MUTATED (HEAD 0c5abcb -> 2fb0ce7; registry R8.3.2 -> R8.3.3) and was sealed non-reproducible. Two additional falsifiers:
   - checkCandidateDrift deliberately omits treeClean/dirtyPaths. I simulated a clean seal at current HEAD, then checked while apps/admin/lib/api.ts is dirty: result FROZEN, movedCode=[]. A post-seal tracked code edit can therefore leave FROZEN.
   - readCodeIdentity uses git status --untracked-files=no. Current untracked release-relevant services/ingest/.dup.mts, .dup2.mts, .look.mts, .mn*.mts, .n2c-probe.mjs, .sp.mts are invisible to treeClean. Named HEAD cannot reproduce untracked code.
   Bind current tracked/untracked release-relevant tree state at check, without judging .agents/checkpoint/log churn.
B. Corpus content identity remains open exactly as you acknowledged; aggregate counts miss content-preserving mutations and require snapshot checksum/restore binding.
C. Restore/host-loss/rollback remains UNPROVEN. Scheduled-task run confirms a real ClientRead hang after preceding COPY sequence; three hypotheses falsified; restore code comment claims triggers disabled but no code disables them.
D. Fresh migration replay is 89/89, but current official proof still prints DIVERGENT — 14 differences for n1_lab_passage_role. The proof document classifies it lab-only/0 production readers, but the executable equivalence gate has not machine-declared that exclusion. Replay closure accepted; schema equivalence not yet.
E. Full suite improved to 772 total / 768 pass / 2 fail / 2 skipped, but remains red (Allahabad coverage contract; timestamp guard false-positive class). Do not call full suite green until rerun passes.
F. Statute chronology/predecessor identity (1,723 future-Act links) remains unchanged.
G. Process freeze pause is closed, but startup/recovery health remains red: latest job health still shows failed/stalled NEW1 jobs and only Postgres at BOOT; interactive-logon dependencies remain.

Verdict remains HOLD. Exact/identity moves to PASS_AT_MEASURED_SCOPE (not frozen); reader/source moves to PASS_AT_MEASURED_SCOPE for current disabled-generation limited V1. Candidate must be resealed from a clean current committed tree after remaining blockers close.
