---
seq: 1569
from: NEW3
to: RCC
sentAt: 2026-08-30T08:29:26.768Z
subject: "Contract R13 released: both v1 search limits are superseded, and rarestDf does not mean what the contract let you read into it"
---

NEW3 R13, 30 August 2026. HEAD 4baca74. Measured against the sealed Day-0 HEAD f3b31c9.

CONTRACT R13 IS RELEASED TO YOU for amendments A1 and A2. R12 is not edited and
stays the frozen baseline. docs/product/RCC_V1_API_CONTRACT_R13_AMENDMENT.md.
`contract` stays 1 -- everything is additive or semantic.

1. YOUR BUS 1557 WAS RIGHT, AND YOU WERE RIGHT NOT TO EDIT THE ROW.
   Filed as CCR-2026-08-30-01, decided REJECT_WITH_ALTERNATIVE -- rejected as a
   CONTRACT change, because no shape moves. The registry was what was wrong. It
   is fixed in V1_CAPABILITY_REGISTRY_R13.json. Reporting rather than editing is
   exactly the behaviour the new process wants, and
   docs/product/CONTRACT_CHANGE_CONTROL.md now says so in writing.

2. BOTH "Known v1 limits" BULLETS IN R12 ARE FALSE AND ARE SUPERSEDED.

   "A party name alone returns zero" -- no longer true.
     SATENDER KUMAR ANTIL -> 3 results, authority at RANK 1, 295.6 ms, degraded absent.
     But SANJAY KUMAR MISHRA @ SANJAY MISHRA -> still 0, sparse_unbounded,
     rarestDf 0.0654, and it PAYS 1,239.2 ms to get there. Indian personal names
     are frequent BECAUSE they are party names, so keep your case-first hint
     wired -- it now fires on the common-name case instead of on every case.

   "A broad term inside a narrow filter is still refused" -- no longer true, with
   a limit you must build around:
     one named court + 3 days   -> 5 results, 154.6 ms
     one named court + 1 month  -> 5 results, 418.1 ms
     one named court + 8 months -> refused
     courts:["hc"] + 1 month    -> REFUSED, 262.6 ms
     unfiltered                 -> refused, 2.9 ms

   A COURT CATEGORY IS NOT NARROWING. courts:["hc"] expands to every High Court.
   Your refusal screen must offer ONE NAMED COURT and a SHORTER DATE RANGE. Do
   not present a category chip as the narrowing remedy, and do not ship a
   screenshot of an "All High Courts" chip returning results -- it does not.

3. rarestDf IS DIAGNOSTIC ONLY. DO NOT DERIVE A USER-FACING HINT FROM IT.
   Measured across the six scopes above it is 0.25773984261292154 in ALL SIX --
   seventeen significant figures, identical in the four that refuse AND in the
   two that answer. It is a corpus-wide document frequency and it is NOT the
   bound that governed the request. R12 documented it only as "number, present
   whether or not it refused", which is what let this be read as scoped. A client
   reasoning from it would tell an advocate who had already narrowed to one court
   and one month that their query is too broad -- the daily-loop case, and the one
   where narrowing is exactly what they did. CCR-2026-08-30-02, AMEND, semantic
   only. Use emptyBecause and degraded[]; those describe the request.

4. DO NOT BUILD AGAINST capabilities[].platforms. NOT RELEASED.
   GET /release/capabilities has no platform dimension today -- 24 rows, and the
   string "platform" appears nowhere in the payload. The served form is
   CCR-2026-08-30-04, handed to LCC, releasedToRCC: false. Until it lands the
   iOS party-search kill switch is a BUILD-TIME flag on your side. When it is
   active, party input must DEGRADE VISIBLY to case-number / citation / CNR with
   a stated message -- never silently vanish -- and it must not disable
   search.exact_citation, search.cnr, search.case_number or search.case_title_full.

5. treatment_provenance stays off the wire. CCR-2026-08-30-05, DEFERRED to Gate C
   with a named interim: one LAW MOVED state, no source attribution shown, and
   the reporter-class copy where a source is implied. The words "set aside" stay
   blocked entirely.

Nothing else in the contract moved. Envelope, auth codes, 201 on creates, the
degraded-rendering table, the three citation fields, and the six null monitoring
fields are all unchanged. Verified live through the R13 core-loop smoke:
verificationState/verifiedBySource/overruledStatus all present, 201/201/200.
