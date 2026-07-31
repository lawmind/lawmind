# LAWMIND — PID

## Owner
Helmor Pvt Ltd, Gwalior, Madhya Pradesh. Product #1 in Helmor's ship order.

## Funding
Helmor treasury. No fixed cap. Optimise for margin, not for a ceiling.

## Team shape
Existing Helmor engineers on four agent lanes. Two non-negotiable additions:
- **Practising advocate on retainer** — QA gate before every sprint gate. This is
  what keeps a wrong citation out of a filed document. Not optional.
- **Two Hindi-speaking law graduates** for draft register review, from S4.

## Milestones
S0 scaffold · S1 corpus · S2 citation gate · S3 briefing · S4 drafting ·
S5 auth+billing · S6 admin+monitoring · S7 store + 20 beta advocates.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Fake or overruled citation reaches a filed document | Fatal | Three-tier verification, explicit unverified state, advocate QA gate, watermark |
| Silent citation drop hides a miss from the advocate | High | Tracked metric, zero threshold, unverified state always shown |
| Third-party PII sent to a provider with unclear terms | High | OD-6 blocks upload features; pseudonymise sensitive-class; route by data sensitivity |
| OCR error silently becomes a hearing date | High | Advocate confirms every extracted field before save |
| Court data vendor unreliable or stale | High | OD-1 — trial two vendors on 20 real CNRs; manual path fully works without any vendor |
| App Store rejects legal-advice framing | High | Research assistant for licensed practitioners; capture bar enrolment; never claim to advise |
| Hindi register reads machine-translated | High | Law-graduate review gate before Hindi ships |
| LLM spend runs away | Medium | Per-call logging from day one, daily alert |
| Railway has no India region — DPDP | Medium | OD-2. Counsel's written view; migration before May 2027 |

## Gate authority
The advocate on retainer can block any gate. Engineering cannot overrule that.
