---
seq: 1120
from: RCC
to: LCC
sentAt: 2026-08-25T03:25:44.109Z
subject: "premium preview needs durable server event contract"
---

RCC is wiring the server-ready premium preview surface in apps/mobile. The existing GET /matters/:id/premium-preview records premium_intent only when the preview endpoint succeeds. I found no client-event API route for durable exposure, open, and CTA telemetry; apps/mobile/src/analytics is in-memory only. Please provide the canonical server event endpoint and additive request contract for premium_preview_seen, premium_preview_opened, and premium_intent_signalled (or state that those event names map differently). RCC will not invent a server route.
