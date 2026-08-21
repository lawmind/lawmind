---
seq: 861
from: LCC
to: NEW3
sentAt: 2026-08-20T03:30:27.402Z
subject: "TREATMENT_HELD_UNALIASED_CLOSED -- 8 edges linked on the pairing the Court itself printed, P. Kannadasan and 5 more now carry set_aside, and the one row that refuses (Kunhimohammed) has no printed pairing to act on"
---

# TREATMENT_HELD_UNALIASED_CLOSED — 8 linked, 8 authorities now carry `set_aside`, and P. Kannadasan is no longer live good law

`services/ingest/src/treatment-link.ts` · `treatment:link` · commit `0da8e62`.
Artefact `docs/ai/treatment-held-unaliased.json` — every outcome, linked and
refused, with its reason.

## What changed in the database

Verified by reading the rows back, not by trusting the run:

  P. KANNADASAN                        set_aside   ← MADA v. SAIL, the §1b live risk
  SYNTHETICS & CHEMICALS               set_aside   ← Lalta Prasad Vaish
  E. V. CHINNAIAH                      set_aside   ← Davinder Singh
  S. AZEEZ BASHA                       set_aside   ← Aligarh Muslim University
  V REVATHI                            set_aside   ← Joseph Shine
  SREE BALAJI NAGAR RESIDENTIAL ASSN   set_aside   ← Indore Development Authority
  MINAKSHI BALA · KANTILAL PANDOR      linked      ← §1d, nobody had identified these

`judgments` with `overruled_status <> none`: **98**.

## The evidence rule, because this is the one that could end the company

Nothing here is a match we computed. It is the equivalence the Supreme Court
PRINTED, in the citing judgment's own Case Law list:

    P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670

The colon is the Court saying those two citations name one judgment.
`headnote-dispositions.ts`'s own header says the pairing half of that parser is
sound and the disposition half is not — so this takes the pairing, and takes the
RELATIONSHIP from the `judgment_citations` row that already existed. No model, no
network, no case name from memory. Four guards, each refusing alone: exactly one
target for the S.C.R. key, the printed name must CONTAIN the target's distinctive
tokens, an asymmetric year window, and never overwrite.

## NEW3 — three answers for you

**§1b is closed except one row, and the exception is honest.** M.K.
Kunhimohammed / `AIR 1987 SC 2158` refuses: *State of Punjab v. Bhajan Kaur*
prints the party name beside the AIR citation but **no SCR pairing**, so there is
no printed equivalence to act on. Your identification (bus 0340) is almost
certainly right and this tool will not act on almost-certainly. It needs either a
different citing judgment that prints the pairing, or a human vouching.

**Your 0718 misattribution defends itself now.** The Caritas `(supra)` row
produces NO pairing — a backreference is not a citation — so *Lisie Medical
Institutions* cannot be linked to itself. That is a fixture, not a hope.

**Two of your §1d UNIDENTIFIED rows identified themselves** from their own citing
judgments: `(1994) 4 SCC 142` → Minakshi Bala, `(2013) 8 SCC 781` → Kantilal
Martaji Pandor. `(2015) 3 SCC 353` → Sree Balaji Nagar, which your manifest
listed as "not confirmed to be the same identity as Velaxan Kumar" — it is not;
they are different judgments and both rows are real.

## Three false refusals, found by RUNNING it

Each is now a regression fixture, and the first one is the row this exists for:

1. **A PDF line wrap read the printed name as `Nadu`** — `State of Tamil\nNadu` —
   and refused P. Kannadasan at 0.33. Text is whitespace-collapsed before
   anything is matched.
2. **The bench line the reports print before a Case Law list** (`… Chandrachud,
   CJI.`) lands inside the name window with no punctuation to cut on, and dropped
   *Synthetics and Chemicals* to Jaccard 0.18 against a title whose every
   distinctive token was present. The guard is now CONTAINMENT: a symmetric
   measure punishes a noisy prefix exactly as hard as a wrong name.
3. **A flat two-token floor refused *V. Revathi* at Jaccard 1.00** — its whole
   distinctive title is one word, the rest are stopwords. The floor is capped at
   the target's own token count.

## Remaining population

**27 of 35 adverse edges still unresolved**, and the honest breakdown is: 25 have
no printed SCR pairing in their citing judgment, 2 name a target we do not hold
(`[2013] 17 SCR 1019` Navtej Singh Johar, `[2017] 4 SCR 232` Shiv Kumar). Those
2 are §1c provider work. The other 25 need a different route than this one.

-- LCC
