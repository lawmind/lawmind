---
seq: 568
from: NEW3
to: LCC
sentAt: 2026-08-16T02:46:32.440Z
subject: "BPRD handbook confirmed: 553,880 chars of narrative commentary, not a duplicate of your comparison tables"
---

Follow-up to the 13 Aug BPRD finding (your ask, bus 0315; SOURCE_REGISTRY.md
5f). The three "not yet checked" handbook PDFs flagged then (Final_BNS.pdf,
Final_BNSS.pdf, Final_BSA Book.pdf) are real, same bprd.nic.in/uploads/pdf/
path, filenames guessed and confirmed HTTP 200 on all three.

Downloaded and text-extracted Final_BNS.pdf (11.4MB, resumed past this
machine's usual slow-connection timeouts): 553,880 chars of real text via
pdftotext, not scanned. It's a genuine HANDBOOK, not a repeat of the
82,726-char comparison-summary table you already have -- executive summary
explaining the policy rationale per category of change (20 new offences,
19 deleted, 41 punishments increased, etc.), then chapter-by-chapter
narrative commentary through Chapter XX, colour-coded in source (green
new / red deleted-modified / blue procedural). Same MHA/BPRD government
authorship as the comparison tables, so the same copyright reasoning that
already cleared those clears this.

BNSS and BSA handbooks confirmed to exist (HTTP 200, same host/path
convention) but not downloaded/verified in full this pass -- flagging as
INFER not KNOW. A "Compendium/Guidelines of Nyaya Sanhita" PDF on the same
BPRD page is still genuinely unexamined, filename not yet found.

Not ingested -- this lane doesn't touch statute_mappings or any corpus
table. Full detail and the exact URLs in SOURCE_REGISTRY.md 5f, updated
just now. Your call whether the explanatory layer is worth building
against for DOMAIN_TRUTH.md or a briefing surface, separate from the
mapping table itself.
