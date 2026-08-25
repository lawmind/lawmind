# LEGAL_TIME_DATA_CONTRACT_V1

**Lane:** NEW2 · **Round:** R7 §10 (P1) / §7.7 · **25 August 2026**

> R7 §7.7: every temporal legal claim must distinguish a reliable known date, a
> suspect date, an unknown date, and the `asOf` context. *A date-suspect source
> cannot silently drive "later authority", historical currentness, or statutory
> transition chronology.*

---

## 1. The trap: `judgment_date` is 100% populated and 96.2% unverified

```
judgments with a judgment_date            18,698,984      100.00%
judgments with a date-QUALITY verdict        713,136        3.81%
judgments with NO verdict                 17,985,848       96.19%
```

**A populated column is not a verified date.** `judgment_date` is never NULL, so
every "later authority" comparison in the product already runs, silently, on a
value that has been checked for fewer than four documents in a hundred.

Where a verdict does exist, it is informative:

| state | method | judgments |
| --- | --- | ---: |
| `DATE_VERIFIED` | date printed in the document agrees | 619,739 |
| `DATE_UNKNOWN` | no independent witness | 59,997 |
| `DATE_SUSPECT` | the filename disagrees with the document | 28,800 |
| `DATE_SUSPECT` | the document prints other dates | 4,600 |
| | | **713,136** |

**4.68% of checked dates are SUSPECT and 8.41% are UNKNOWN.** If those rates hold
over the unchecked 17,985,848 — untested, and stated as a projection not a
measurement — the corpus carries on the order of **840,000 suspect** and
**1,510,000 unknown** dates, all of which currently render as confident dates.

---

## 2. The four states

| state | definition | derivable today? |
| --- | --- | --- |
| `DATE_VERIFIED` | at least one independent witness inside the document agrees | yes — 619,739 |
| `DATE_SUSPECT` | a witness disagrees | yes — 33,400 |
| `DATE_UNKNOWN` | no independent witness available | yes — 59,997 |
| **`DATE_UNCHECKED`** | **the quality pass has not run on this document** | **yes, by absence — 17,985,848** |

**`DATE_UNCHECKED` is the state this contract adds, and it is the important
one.** Today a consumer joining `judgment_date_quality` finds no row and has no
way to distinguish "checked and no witness found" (`DATE_UNKNOWN`) from "never
checked". Those are the same distinction as `NEVER_SCREENED` versus
`SCREENED_NO_DAMAGE_FOUND` in the body-evidence contract, and they want opposite
work: one needs a better witness, the other needs the pass to be run.

## 3. The contract

1. **A missing `judgment_date_quality` row is `DATE_UNCHECKED`, never
   `DATE_VERIFIED`.** No consumer may treat absence of a verdict as a good
   verdict. This is `UNKNOWN is not GOOD`, the sibling of the SQL trap this repo
   has already paid for twice.
2. **`DATE_SUSPECT` and `DATE_UNCHECKED` may not drive a chronological claim.**
   Specifically they may not establish:
   - "later authority" — that B post-dates A;
   - historical currentness — "what was good law on date D";
   - statutory transition chronology — IPC vs BNS applicability by offence date.
   The claim is refused or qualified; it is never made quietly on a weak date.
3. **`asOf` is explicit on every temporal answer.** A currentness statement
   carries the date it was computed for, not an implied "now".
4. **Statute `asOf` is separate from judgment `asOf`** and today only one of the
   two exists at all: `statutes` holds enactment dates (846) and enforcement
   dates (758) but **no version dimension** — one text per act, no
   as-at-date retrieval. Historical statutory text is `NOT_HELD`, so a
   point-in-time statute claim cannot be made regardless of date quality.
5. **Correspondence is not applicability.** `statute_mappings` says IPC s. X
   corresponds to BNS s. Y. It does not say which applies to an offence on a
   given date, and R7 §10 forbids inferring it. The BNS/BNSS/BSA commencement
   date (2024-07-01) is held and verified; the *rule* for which code governs a
   given prosecution is law, not data, and this lane does not encode it.

## 4. The backend data shape this asks for

Additive and provisional, per the lane's standing instruction to build behind a
documented shape rather than stall:

```
judgmentTime: {
  judgmentDate:      "1975-04-21",
  dateState:         "DATE_VERIFIED" | "DATE_SUSPECT" | "DATE_UNKNOWN" | "DATE_UNCHECKED",
  dateMethod:        string | null,       // the witness that produced the verdict
  chronologySafe:    boolean              // false for SUSPECT and UNCHECKED
}
currentnessAsOf:     "2026-08-25"         // never implied
statuteTime: {
  enacted:           "2023-12-25",
  commenced:         "2024-07-01" | null,
  versionAsOf:       null,                // NOT_HELD corpus-wide, stated not omitted
  versionState:      "SINGLE_TEXT_NO_VERSIONING"
}
```

`chronologySafe` is deliberately a single boolean the server computes, so a
consumer cannot get the rule wrong by reading `dateState` and forgetting
`DATE_UNCHECKED`.

## 5. States

| question | state |
| --- | --- |
| `judgment_date` populated | `OBSERVED_BY_LIVE_DB` — 100% |
| date quality coverage | `OBSERVED_BY_LIVE_DB` — 3.81% |
| suspect/unknown rate on the unchecked 96.19% | **`NOT_MEASURED`** — §1's projection is a projection |
| historical statute text | **`NOT_HELD`** — no version dimension exists |
| per-section commencement | **`NOT_HELD`** |
| which code governs an offence on a given date | **out of scope** — a rule of law, not data |
