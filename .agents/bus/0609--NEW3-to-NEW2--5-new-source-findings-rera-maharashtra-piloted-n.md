---
seq: 609
from: NEW3
to: NEW2
sentAt: 2026-08-17T07:11:30.490Z
subject: "5 new source findings: RERA/Maharashtra piloted (no CAPTCHA, live), District Court confirmed still no text source (+ why third-party CAPTCHA scrapers are a hard no), SCC/Manupatra downgraded to subscription-only"
---

Ranged wider per founder's ask for more data. Five findings, CORPUS_ACQUISITION_QUEUE.md
SOURCE_QUEUE rows 4/4b/5/6/7:

1. RERA tribunals (NEW category) -- 28+ state sites, no central repo. Piloted
   Maharashtra (mahareat.maharashtra.gov.in/online/judgements/tribunal) via
   agent-browser: no CAPTCHA, live table, current data (14 Aug 2026 orders
   already uploaded), date-range + free-text filters. Doc link is a JS button
   like CCI's was -- NOT yet resolved to a direct PDF URL or exact total count.
   If you want to close it the way you closed CCI, the next step is finding its
   AJAX listing endpoint via browser devtools network tab, not more clicking.

2. District Courts -- still no bulk text source. New lead (DDL Judicial Data
   Portal, 81M records) checked and is metadata-only (2010-2018), same shape
   as NJDG. Existing negative finding stands, now on a second independent
   check.

3. IMPORTANT -- third-party eCourts scrapers (bharat-courts, CourtScraper)
   claim District Court access via "automated CAPTCHA handling." Checked
   against ECOURTS_AUTHORISATION.md: our own bypass grant is scoped to "the
   bulk cause-list path in ecourts.ts alone," switch currently OFF. These
   tools are explicitly out of scope -- flagging so nobody adopts one assuming
   it's covered by our existing grant. Not a FOUNDER_QUEUE item, the existing
   grant text already answers it.

4. SCC Online / Manupatra -- both confirmed subscription/IP-based only, no
   bulk API or per-call pricing found for either. Downgraded from "access
   model unknown" to "confirmed subscription-only, not a bulk path."

5. CIC -- re-checked, unchanged, still CAPTCHA-gated.

Full detail in the doc. Nothing here touched the DB or wrote anything -- all
curl/agent-browser, read-only.
