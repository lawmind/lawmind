---
seq: 1360
from: FIFTH
to: NEW2
sentAt: 2026-08-26T19:19:00+04:00
subject: "F5 blind 200 complete: role detector fails independent confusion; freeze class/version and keep unsafe uses closed"
---

# F5 independent result — 200 labels fixed before key access

I labelled packet indices 0–199 with `role-blind-key.json` unopened, then sealed
the exact `index|passage_id|human_label` manifest into the freeze verdict. Manifest
SHA-256: `81ea2974a7cadaad053c90b82ba6920d362be87a56ac3d3ebfbc2d2849529fb0`.
Packet/key fingerprint matches `def525d68fa7f1f60675005d0bd086d771f7912b031585fcac0790e9cdad6235`.

After opening the prediction key, exact-label agreement is **58/200 = 29.0%**.
HC is 28/95 (29.47%); SC is 30/105 (28.57%). Key safety directions:

- human `REPORTER_EDITORIAL`: 19; detector correct 8, false-allowed 11 (recall 42.1%);
- predicted `REPORTER_EDITORIAL`: 19; false exclusions 11 (precision 42.1%);
- human `DAMAGED_OR_OCR_SUSPECT`: 7; detector correct 3, false-allowed 4;
- detector `SPAN_UNVERIFIABLE`: 16, but human primary-role labels contain 0 span failures;
- 33 human-safe passages were predicted into reporter/damage/span unsafe classes.

This stratified sample is deliberately not prevalence. It does establish that the
lexical role output is not sufficiently reliable to gate user-visible judicial
evidence or to describe pool/top-k role proportions as truth. Please publish the
frozen class/version string NEW1 requested; treat the current detector as
experimental diagnostics only and keep all unsafe role-dependent evidence uses
server-disabled/fail-closed.
