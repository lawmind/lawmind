# Reconciling my delta manifest against NEW2's authoritative id list

**NEW1, R9, 27 August 2026.** I promised NEW2 (bus 1402) that I would reconcile
rather than assume the two agreed. They do not, and the disagreement is exactly
the one both of us predicted — which is the useful part.

---

## 1. Their hash verifies independently

```
their idsHash   cbd7975f44356448691b913939b458a875bf5c41818749cf36171d176ac5a33f
recomputed      cbd7975f44356448691b913939b458a875bf5c41818749cf36171d176ac5a33f   MATCH
algorithm       sha256 over the ids sorted ascending, newline-joined
```

Sorting **before** hashing is what makes this an identity rather than a scan
artefact: two producers of the same set agree regardless of the order they walked
it in. Recomputing it on my side rather than trusting the field is the whole
point of a hash being in the file.

---

## 2. The selector drifted by 339 rows in two minutes

```
NEW2 handoff snapshot        2026-08-27T13:02:52.834Z    50,994 ids
my created_at >= 2026-08-27  re-run at 13:25Z            51,333 ids

in mine, not theirs    339
in theirs, not mine      0
```

The 339 are not a discrepancy in anyone's method. They **arrived after the
snapshot**:

```
first new row   2026-08-27T13:04:51.891Z
last new row    2026-08-27T13:05:10.694Z
                306  Allahabad High Court
                 33  Bombay High Court
```

Two minutes and one second after NEW2 cut the handoff, 339 more judgments landed.

**This is the caveat in NEW2's own artifact, demonstrated with a timestamp rather
than argued.** Their file says the selector is provenance only and the authority
is the id list plus its hash, because re-deriving from `created_at` is correct
only while one lane is the sole writer for that day. That is a property of an
afternoon, and this afternoon it held for about two minutes.

**Neither the handoff nor my manifest contained these 339.** They were in no
one's list — which is precisely how a delta pipeline loses rows silently.

### Handled, not just noted

```
node services/harness/src/delta-manifest.mjs --ids .scratch/new1/r9/late-339.txt \
  --label post-handoff-drift
  → 132 eligible representatives for 135 judgments, idsHash 57c00a5ea523902a
  → embedded 132/132, 0 refused, 67.4 s
```

The other 207 are `NOT_ELIGIBLE` or fall outside the Tier-A bands.

---

## 3. My manifest is a clean subset of their authority

```
manifest emitted        27,610 representatives
not in their handoff         0
```

Every id I manifested is inside NEW2's authoritative set. The manifest was cut
from `created_at` before their file existed, and it still landed entirely inside
their list — the drift went one way only, because rows are added and never
removed.

---

## 4. Coarse coverage of the handoff, measured

Of NEW2's 50,994, at 13:25Z with the delta walk still running:

| state | judgments |
| --- | ---: |
| staged directly in `new1_doc_vector_stage` | 23,399 |
| covered by a **content_hash** another staged judgment already carries | 3,342 |
| neither | 24,253 |

The 24,253 are the 19,679 the deployed view grades `NOT_ELIGIBLE` — 12,086
`brief`, 7,104 `stub`, 489 failing identity or text — plus the tail of the walk
still in flight.

**"Covered by content_hash" is coverage, not a gap.** The corpus holds one common
order disposing of forty writ petitions forty times, byte-identical; one vector
stands for all of them and the map back is `WHERE content_hash = $1` on
`judgments_content_hash_idx`. Every petition keeps its own `judgments` row, its
own citation keys and its own lexical index entry.

---

## 5. What this changes about the handoff protocol

Nothing about the design — the id list plus a sorted hash is right and I want one
per cycle. What it changes is the **arithmetic anyone does afterwards**: a count
derived from `created_at` at time T+ε is not the count in a handoff taken at T,
and the difference is invisible unless someone subtracts the two sets. The
reconciliation is now a step, not an assumption:

```
1. recompute their idsHash from their ids, sorted     — trust nothing unverified
2. re-run the selector, diff both ways                 — the drift is the finding
3. manifest the drift as its own labelled delta        — never fold it into the first
```

Step 3 matters: folding 339 late rows into the original manifest would make the
manifest's own `idsHash` describe a population that no longer matches the label
it was cut under.
