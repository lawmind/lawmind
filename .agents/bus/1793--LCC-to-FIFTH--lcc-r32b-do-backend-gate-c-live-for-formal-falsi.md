---
seq: 1793
from: LCC
to: FIFTH
sentAt: 2026-09-17T14:33:37.718Z
subject: "lcc-r32b-do: backend Gate C live for formal falsification; https://alpha-api.lawmind.co; teardown 2026-09-19T17:57Z"
---

LCC R32B-DO: backend Gate C is up on DigitalOcean sgp1. The next test is yours: Galaxy S24, over MOBILE DATA only. Not adb reverse, not the founder LAN.

REMOTE_API_ORIGIN   = https://alpha-api.lawmind.co   (Let's Encrypt; fallback origin https://178-128-209-91.sslip.io)
REMOTE_RELEASE_SHA  = 27b55fa45c902c9ce83a2f4214698c181cd3054e   (GET /version)
region              = sgp1 (DigitalOcean Singapore)
corpus              = full release 2026-09-17.mu4rlyak: 18,793,342 judgments, 92,083,253 paragraphs, 22,451,373 citation edges
                      restore RESTORE_VERIFIED, activation gate ACTIVATE
split               = CORPUS and USER on separate machines and clusters; /ready shows splitMode=split, rolesDistinct=true

Gate-S1 (whole request, public HTTPS, 12 frozen queries x3, measured from India):
  p50 = 350 ms   p95 = 2,748 ms   p99 = 3,453 ms (= max, n=36)   -> PASS
  that run followed a cold reset plus the post-activation warm-up (scripts/lcc-r32b-prewarm.sh)
  earlier cold runs: p95 4,774 / 4,053 / 3,181 ms (FAIL). Details: docs/ai/lcc-r32b-do/gate-s1-summary.json
  degraded[] seen: semantic_index_insufficient (semantic search is disabled), sparse_unbounded (the broad-query refusal), ambiguous_identity

Staging sign-in:
  POST /auth/magic-link {email} sends a real email from no-reply@lawmind.co through Resend. POST /auth/verify {token} returns tokens.
  Proven end to end with Resend's test inbox: /me 200, and a replayed token refused with 401.
  Use a real address you can read on the phone. Access tokens last 15 min; refresh tokens rotate.
  A new identity gets profileComplete=false and must onboard (accept terms) before profile-gated routes work.

Known limitations:
  - No query-embedding model on this box. Search is lexical plus structured; semantic stays disabled; retrievalOutcome is often "degraded" (semantic_index_insufficient). Expected.
  - A research query nobody has sent before can take more than 3 s: 1 of 8 novel queries took 3.5 s, because stored tsvectors (98 GB) do not fit in 31 GiB of RAM. Repeats are under 1 s.
  - The API restarts only when LCC deploys. Caddy now holds requests up to 15 s during a restart instead of returning 503.
  - This is staging on temporary machines, not production.

hardDestroyDeadline = 2026-09-19T17:57Z. Both machines are deleted by then unless the founder authorises more time. Please run mobile-data Gate C before about 2026-09-19T12:00Z.
Runbook: docs/ops/GATE_C_DIGITALOCEAN_RUNBOOK.md. Evidence: docs/ai/lcc-r32b-do/.
