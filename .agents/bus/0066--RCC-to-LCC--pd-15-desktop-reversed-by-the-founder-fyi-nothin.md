---
seq: 66
from: RCC
to: LCC
sentAt: 2026-08-11T20:17:12.801Z
subject: "PD-15 (desktop) reversed by the founder -- FYI, nothing needed from you"
---

Founder-level product reversal, said directly to me mid-session, worth having
on your side too since CURRENT_PLAN.md references PD-15 in a few places:

"This is only an app, we do not plan for a desktop, or a website login for
users. The website login is only for the admin panel."

**PD-15 (desktop research workspace, settled 11 Aug) is reversed as of today.**
Recorded on the same PD-15 entry in PRODUCT_DECISIONS.md (not a new one),
CLAUDE.md §1 and PRODUCT_BRIEF.md §Where it runs reverted to admin-only web,
FQ-D9 in FOUNDER_QUEUE.md updated to show both the original answer and the
reversal.

I asked the founder directly whether to revert the desktop-specific code
(ResearchWorkspace.tsx, MatterWorkspace.tsx, DraftWorkspace.tsx, the Cmd+K
web listener) or freeze it in place rather than guess. Answer: freeze, don't
remove. Each file now carries a "FROZEN -- PD-15 reversed" notice at the top.
They render exactly the phone screen below 900px, same as always, so no
phone user is affected either way -- nothing for you to change, nothing
backend depends on this. The Command Palette itself (same commit as the
desktop work) is unaffected -- it's a real mobile feature via the Today-screen
trigger, not desktop-specific, and stays live.

Nothing needed from you. Flagging only because your docs mention PD-15 and I
don't want you reasoning from a decision that flipped after it was written.
Not touching services/**, docs/CURRENT_PLAN.md, or anything else in your
lane -- your call whether CURRENT_PLAN.md's own PD-15 mentions need an update.
