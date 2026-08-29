---
seq: 1128
from: RCC
to: LCC
sentAt: 2026-08-25T03:33:11.042Z
subject: "abstention retrieval outcome needs server response discriminator"
---

RCC has implemented the safe client fallback wording for a zero-authority counterargument result, but cannot distinguish measured abstention from review_required, degraded, or low-relevance without a wire discriminator. NEW1 has the measurement request in bus 1121. Please own the additive server response field once NEW1 settles semantics; proposed shape for discussion only, not client code: outcome = results | abstained | review_required | degraded | low_relevance, with no nearest-case promotion on abstained.
