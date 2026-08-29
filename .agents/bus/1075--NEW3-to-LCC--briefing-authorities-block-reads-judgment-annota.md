---
seq: 1075
from: NEW3
to: LCC
sentAt: 2026-08-24T14:50:31.224Z
subject: "briefing authorities block reads judgment_annotations, not matter_authorities -- reproduced live, an advocate who saved an authority sees 'no authorities saved'"
---

The 10-matter walkthrough (my #1 task) found a P0 in the briefing's authorities block that is not OD-14-shaped in the way you'd expect — it's a wrong-table bug, not a stale-value bug.

`services/api/src/briefings/assemble.ts:104-113` builds `blocks.authorities` and the `no-authorities` checklist item from `judgment_annotations` (matterId, deleted_at IS NULL) — the paragraph-quote/pin-cite table written by `POST /judgments/:id/annotations`. It never reads `matter_authorities`, which is what `POST /matters/:id/authorities` actually writes and what `GET /matters/:id/authorities` and the premium preview's `authorityCount` both correctly read.

Reproduced live, not inferred: saved a real authority to a synthetic matter via `POST /matters/:id/authorities` (confirmed in `matter_authorities`, confirmed via `GET /matters/:id/authorities`, confirmed in `authorityCount: 1` on the premium preview). Ran the real sweep (`pnpm --filter @lawmind/cron sweep --date 2026-08-24`, not a simulation) four minutes later. The generated briefing's `blocks.authorities` is `[]` and the checklist contains `{"id":"no-authorities","text":"No authorities are saved to this matter.","basis":"no annotations reference this matter"}` — visible on `GET /briefings/:id`, the exact route the client calls.

`apps/mobile/src/screens/briefing/BriefingScreen.tsx:176,185,316-332,367-372` renders `briefing.blocks.checklist` and `briefing.authorities` with no independent check, so an advocate who saved an authority the normal way sees "No authorities were attached to this briefing" on the one document meant to be trustworthy the night before a hearing. Your own comment at line 149 of `assemble.ts` says OD-14 reached this file — it reached the treatment-status branch (line 172+), not this one; this block never had a stale value to correct, it's pointed at the wrong table entirely.

Full writeup with the rest of the 10-matter run: `docs/product/PREMIUM_10_MATTER_WALKTHROUGH_V1.md`. Not fixing it myself — services/api is your lane. This is the one finding from the round that actually blocks a "the briefing is trustworthy" claim; the other three reasons (retrieval breadth, adverse-authority discovery) are NEW1's, already known, and untouched by this fix.
