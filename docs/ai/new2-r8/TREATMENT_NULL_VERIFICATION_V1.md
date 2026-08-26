# TREATMENT_NULL_VERIFICATION_V1 — R8.1 §7.11

**Lane:** NEW2 · **26 August 2026**
**Verdict: `PROVEN` closed. No NEW2 work required — LCC shipped it and this verifies it.**

§7.11: *"Strong-treatment row with no provenance = explicit UNKNOWN/UNCLASSIFIED."*

---

## 1. The measurement

```
relationship         rows   no_provenance   no_evidence
followed           14,023           3,783             0
distinguished       1,742             563             0
overruled             117               2             0
approved               55              54             0
overruled_in_part      23               0             0
doubted                22               1             0
```

**4,403 of 15,982 treatment rows (27.5%) carry no provenance.** Among the strong
classes that drive a LAW MOVED badge, it is **3 rows** — 2 `overruled`, 1
`doubted`. Every row has evidence text; what is missing is the classification of
*who said it*.

---

## 2. It is already handled, in code, correctly

`services/api/src/judgments/precedential-effect.ts`:

```ts
const a = e.provenance === null ? 'UNKNOWN' : (ATTRIBUTION_FOR[e.provenance] ?? 'UNKNOWN');
```

NULL maps to `UNKNOWN` explicitly, and an unrecognised value falls to `UNKNOWN`
too rather than to a default that flatters. On the wire
(`documents/route.ts`, `judgments/route.ts`, `arguments/counter.ts`):

```ts
treatmentAttribution: (… derived …) ?? 'UNKNOWN'
```

And wording is gated separately:

```ts
export function mayStateAsHolding(attribution: TreatmentAttribution): boolean {
  return attribution === 'COURT';
}
```

**Only `COURT` may be worded as something the later court held.** `UNKNOWN`
cannot, and it never suppresses the warning — attribution governs wording, not
whether the badge appears.

---

## 3. What the badge actually rests on, re-measured

Strong-treatment edges pointing at a judgment that carries a LAW MOVED badge:

| provenance | → set_aside | → doubted | → partly_set_aside | → none |
| --- | ---: | ---: | ---: | ---: |
| `REPORTER_EDITORIAL_ANNOTATION` | **92** | **20** | **14** | 3 |
| `COURT_REASONING_EXPLICIT` | 4 | 1 | — | — |
| `MODALITY_DEFECT` | 1 | — | — | — |

**126 of 131 (96.2%) rest on a reporter's editorial annotation.** That
corroborates R7's hand-read 95.62% from a different query shape; the small gap
is denominator (R7 counted 137 edges total, this counts 131 pointing at
currently-badged judgments).

`LAW MOVED` — the one thing amber `#B4690E` is reserved for — is almost entirely
a law reporter saying a later court overruled this, not the later court's own
words.

**And that is the right design, which is worth stating explicitly because the
number invites the opposite conclusion.** `precedential-effect.ts` reasons it
out: demoting reporter evidence out of the badge would turn 98 LAW MOVED marks
into 5, and an advocate would file on 93 authorities a reporter has recorded as
overruled. The fix for weak attribution is to **attribute it**, never to drop
the warning. G4 says reporter text cannot masquerade as court reasoning — it
does not say reporter text is worthless.

---

## 4. Why this matters more after §7.9

`REPORTER_APPARATUS_V1` measured reporter page furniture in **93.2%** of Supreme
Court documents against a 4.4% High Court control, and R7's treatment pilot
refuted 4 of 11 candidates *because the evidence window was apparatus*.

So the 96.2% above is not an accident of one enrichment run. **The corpus's
most-cited half is saturated with reporter apparatus, and any treatment
extraction that reads a window around a citation will keep landing in it.**
That is the standing argument against scaling the proximity architecture, and
§7.10 already forbids it.

---

## 5. State

| item | state |
| --- | --- |
| NULL provenance → explicit `UNKNOWN` | **`PROVEN`** — in `attributionOf`, and on three routes |
| unrecognised provenance → `UNKNOWN` | **`PROVEN`** — falls safe, not to a default |
| only `COURT` may be worded as a holding | **`PROVEN`** — `mayStateAsHolding` |
| attribution never suppresses the warning | **`PROVEN`** — governs wording only |
| strong-treatment rows with no provenance | **3** — 2 `overruled`, 1 `doubted`; all render `UNKNOWN` |
| 96.2% of badge edges are reporter-derived | **`PROVEN`** — corroborates R7's 95.62% |
| `approved` 54 of 55 without provenance | **noted, not release-critical** — `approved` drives no badge |
| §7.11 | **CLOSED. No NEW2 change required.** |
