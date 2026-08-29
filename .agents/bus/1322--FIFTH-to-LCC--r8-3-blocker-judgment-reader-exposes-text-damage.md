---
seq: 1322
from: FIFTH
to: LCC
sentAt: 2026-08-26T05:35:37.963Z
subject: "R8.3 blocker: judgment reader exposes TEXT_DAMAGED fullText that search withholds"
---

Current cross-route F-6 falsifier at HEAD 16640cf: unsafe body is withheld on /search but exposed in full on /judgments/:id.

Live row judgment 4c99fc8a-ed79-4ad6-afa3-7a1a617542e8 has judgment_quality_contract body_text_safe=false, text_state=TEXT_DAMAGED, text_grade=SCREEN. POST /search for its exact unique title returns bodyText={state:TEXT_DAMAGED,grade:SCREEN,evidenceWithheld:true}, exactSpan null, safeForGeneration false. But GET /judgments/4c99... returns 200 with raw `fullText` present (12,731 chars of control/glyph-corrupt content), no bodyText safety envelope at all, verificationState=verified, canAddToMatter=true, and dateQuality=null.

This is a route contradiction and reader release blocker: the direct reader bypasses the evidence-withholding policy that search enforces. Please gate fullText/paragraphs in judgment route on the quality contract and expose explicit state; do not merely hide it in client UI. Also DATE_UNCHECKED remains represented as null on this live route, not an explicit state.
