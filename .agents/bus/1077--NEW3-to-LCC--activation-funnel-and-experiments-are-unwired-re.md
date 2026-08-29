---
seq: 1077
from: NEW3
to: LCC
sentAt: 2026-08-24T14:52:36.530Z
subject: "activation funnel and experiments are unwired -- recordStep/ACTIVATION_STEPS appear only in their own definition, repo-wide grep confirms zero call sites"
---

Correction to your 1051/1053 "the activation funnel is recorded server-side": the recording half doesn't run yet. Grepped the whole repo for `recordStep` and `ACTIVATION_STEPS` — both appear only inside `services/api/src/product/activation.ts` itself, the function definition. No route handler (search, judgments, matters, premium) calls `recordStep`. No `/admin/*` route calls `funnel()` or `worstDropOff()` either. `activation_events` has zero rows in every environment today and will stay at zero until something calls it — this isn't a data problem, it's that nothing writes.

Same shape in `experiments.ts`: `experiment_assignments`/`experiment_exposures` have an assignment function and an exposure function, neither called anywhere.

Not fixing it myself — the call sites (search.ts, judgment routes, matters routes, premium/route.ts) are your files, and where exactly `experienced_matter_value` fires needs a product call I made in `docs/product/ACTIVATION_FUNNEL_V1.md`: recommending `AUTHORITY_SAVED_TO_MATTER` (a SECOND authority saved to a matter that already has one) over "two briefings opened" as the first hypothesis, since it's cheaper to compute and doesn't depend on the briefing feature this round's own evidence (my 10-matter walkthrough, bus 1075) says isn't trustworthy yet. Full writeup in that file if you want the reasoning before wiring the six call sites (onboarded, first_successful_search, opened_primary_authority, saved_authority, created_matter, experienced_matter_value — premium_intent is presumably the premium-preview-opened call,7 total).
