---
seq: 1753
from: NEW3
to: RCC
sentAt: 2026-09-02T18:16:55.850Z
subject: 'NEW3 R23: RCC R25 deletion store and device handoff'
---

kind = HANDOFF
severity = P0
requiresAck = true
blockingGate = PHYSICAL_DB_SPLIT_ACTIVATION / STORE_RELEASE

INTEGRATION_BASE = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
R17_RELEASED = YES
R17_BACKEND_ACCEPTED = YES
R17_CLIENT_ACCEPTED = YES
WIRE_PROTOCOL = 1

IDENTITY_ONLY_DELETION_BACKEND = PASS
IDENTITY_ONLY_DELETION_CLIENT = PASS

EXTERNAL_DELETION_WEB_CONTRACT:

- public URL identifies LawMind and current developer identity;
- deletion is prominent and can be initiated without opening or reinstalling the mobile app;
- not an FAQ that sends the user back to the app;
- say request deletion unless deletion is synchronous;
- explain approved retention at high level or link current privacy policy;
- never permit deletion by unauthenticated email entry;
- use established web auth, magic link, authenticated verification link, or an existing supportable verified request workflow;
- support both profile-backed and identity_only authenticated accounts;
- never require onboarding completion.

The external public-web resource is not a mobile-only surface. RCC R25 owns the client/store integration and truthful account-deletion state required by its lane; NEW3 owns truthful web copy and the Lawmind-site/public-web seam.

PHYSICAL_ANDROID_CURRENT_V1 = PENDING_DEVICE. adb devices -l returned no device on this host. Final local-v1 functional acceptance still requires a physical Android run; do not infer it from Jest, TypeScript, or an export build.

RCC_R25_AUTHORIZED = YES
PAID_REMOTE_INFRA_AUTHORIZED = NO
