# RESOLVER_CORRECTNESS_FRESHNESS_V3

**Owner:** LCC (serving side) · **Joint with:** NEW2 (ingest side) · **Date:** 25 August 2026
**R7 §8 LCC-P0** · **Commits:** `aa543b7` · **Gate:** G4 reviewer input

R7's framing, which is the whole point of the document:

> *Freshness is identity correctness, not merely monitoring.*
> *A small newly ingested collision may not remain confidently UNIQUE because global backlog is below a broad threshold.*
> *Test begins from a CURRENT index, then inserts a duplicate/collision and proves no false unique window.*

**VERDICT: the window was real, is reproduced, and is closed.** A second harness violation
(61 live false pins) was found alongside it and is also closed.

---

## 1. The window, measured before it was fixed

`OBSERVED_BY_LIVE_DB`, inside a transaction that was always rolled back:

```
STEP 1  freshness BEFORE               CURRENT · lagRows 0 · lagHours 19.1
STEP 2  resolve "1950 INSC 1"          UNIQUE · 1 candidate
STEP 3  insert a colliding judgment    same neutral citation, no key row yet
STEP 4  freshness AFTER                CURRENT · lagRows 1 · because []
STEP 5  resolve "1950 INSC 1"          UNIQUE · 1 candidate

        >>> FALSE UNIQUE WINDOW: two judgments claim 1950 INSC 1
            and the resolver says exactly one.
STEP 6  rolled back
STEP 7  probe rows left behind: 0
```

R7 predicted this exactly. It was not a prediction.

### Why the existing gate could not see it, and was right not to

`key-freshness.ts` already gated `UNIQUE` on two bounds — `MAX_LAG_ROWS = 25,000` and
`MAX_LAG_HOURS = 72` — and both are sound. They were built after NEW2's real incident: a
false-UNIQUE rate of **15.63%**, 33,013 shared-neutral groups collapsing to one confident
answer, because `judgment_citation_keys` was **309,130 neutral citations behind its own cursor**.

The collision here is **one row**. It is four orders of magnitude below the threshold.

That is the structural finding, and it is not a tuning problem:

> **`MAX_LAG_ROWS` answers *"how much damage might there be across the whole corpus"*. That is
> the right question for an operator and the wrong one for a single answer handed to an
> advocate. The advocate's citation does not care that the other 24,999 unwalked rows are
> irrelevant to it.**

Lowering the threshold does not fix it — it trades a false-UNIQUE window for a permanent refusal
to answer any exact citation lookup, which costs an advocate the one feature that works today.

---

## 2. The fix — two questions, not one tighter one

R7 offers three designs: *synchronous key update for new citation-bearing rows*, *an exact
ingest/key frontier*, or *equivalent fail-closed currentness*. This is the second.

The gate is now:

| question | who it serves | where |
|---|---|---|
| **global** — has the index fallen far enough behind that uniqueness is generally unsafe? | the operator | `mayAssertUnique(state)`, unchanged |
| **per-key** — is there anything in the unwalked window claiming *this* key? | the advocate | `collidingKeysInUnwalkedWindow()`, new |

Both must pass before `UNIQUE` is asserted. A collision small enough to slip under the threshold
is caught by the second.

Four things about it are deliberate:

1. **The unwalked window is bounded by the frontier cursor and is normally empty.** So the check
   costs a boolean on a healthy index and does real work exactly when it matters — cheap
   precisely when it is uninformative.
2. **Canonicalisation runs through `canonicalKeyFor`, in JS.** Reimplementing it in SQL would be
   a second definition of citation identity, and two definitions of identity is how a resolver
   and its index came to disagree in the first place.
3. **`WINDOW_CAP = 50,000`.** Above it the honest answer is that we cannot check exactly, and the
   threshold gate — which will already have said STALE at 25,000 — is the backstop. Without the
   cap, a builder down for a week would turn every citation lookup into a scan of everything
   ingested since. Stated rather than assumed; the consequence is in §5.
4. **Still only `UNIQUE` is gated.** Staleness can only ever HIDE a candidate, never invent one,
   so `AMBIGUOUS`, `TARGET_NOT_HELD` and `REFUSED` pass through untouched. Blanket-failing every
   resolution would take a working `AMBIGUOUS` answer away for no safety gain.

After the fix, same probe: **`UNIQUE_UNCONFIRMED_STALE_INDEX`.** The candidate is kept; the
*claim* of uniqueness is withdrawn.

---

## 3. The test, and proof it can fail

`services/api/src/citations/resolver-freshness-window.test.ts` — R7's shape exactly.

It runs against the **real corpus**, picks a citation the index currently resolves as genuinely
UNIQUE (from the index, never hard-coded — a rotted fixture makes a test pass for the wrong
reason), asserts that premise first, then inserts the collision in a transaction that is always
rolled back and checks nothing was left behind.

**Falsified.** Removing the per-key term fails it; restoring passes.

A second test asserts a clean index **still answers UNIQUE**. Without it, a gate that downgraded
everything forever would pass the first test and quietly cost an advocate a working
exact-citation lookup.

### One thing the test got wrong first, worth recording

The first version asserted `lagRows === 1` absolutely. It **passed alone and failed at 4 under
the full suite** — the other citations tests insert judgments against the same database. An
absolute assertion there does not test the gate; it tests that nobody else is working. It is a
delta now, plus an assertion that the window stays far below `MAX_LAG_ROWS` so the threshold
gate cannot be what caught the collision.

Citations suite: **58 tests, 57 pass, 0 fail, 1 skipped.**

---

## 4. The second violation, found alongside — 61 live false pins

NEW2's bus 1223. `judgment_citations` held **827 rows whose `citation_text` is a registry
despatch stamp** — `2011:FEBRUARY:11`, an upload timestamp that landed in `neutral_citation` on
431 Madras judgments — and **61 carried a `cited_judgment_id`**, pinned to one specific judgment
each.

`CITATION_HARNESS.md` forbids pinning a citation to an authority on evidence that does not
support it, and this is the worse direction: **verified is silent**, so an advocate sees nothing
at all to distrust.

**NEW2's generalisation is the part worth keeping:**

> a citation can be pinned in THREE places — the key index, the resolver's live lookup, and the
> materialised `cited_judgment_id` — and a fix to one is not a fix to the others.

The 24 Aug purge and resolver gate were correct and complete for the two stores they covered.
`cited_judgment_id` is a materialised edge written by the extraction pass; a gate that refuses a
stamp *at lookup* does not un-write an edge resolved before the gate existed. This is the same
shape as the admission gate wired into one caller of two, and OD-14 running stale in three more
places.

**Blast radius measured before touching anything** — the column is read in five serving paths
(`judgments/treatment.ts`, `as-at.ts`, `judgments/route.ts`, `treatment-lookup.ts`,
`propagate-treatment.ts`), so the question was real:

```
all 61 relationship = 'cites'   ·   treatment-relationship pins 0
targets carrying a LAW MOVED badge: 0
```

Nothing an advocate is told about currentness moves. `scripts/lcc-unpin-despatch-stamp-edges.mjs`
**re-measures that on every run and refuses to apply if either is non-zero** — unpinning
something that changes a currentness claim is a decision to take with NEW2, not a cleanup to run
from a script.

**One definition, not two.** NEW2 proposed the same regex `resolver.ts` already holds, but a copy
in SQL is still a second definition. So the SQL pattern is a deliberately **over-broad
prefilter** and `canonicalKeyFor` has the final say; a disagreement between them is reported
loudly rather than skipped. Zero disagreed.

```
unpinned 61 · still pinned after 0 · rows still PRESENT 827
```

`citation_text` untouched — each becomes an *unresolved reference* rather than disappearing.
Deleting would have been the silent drop this codebase measures at a threshold of zero.

---

## 5. The joint design with NEW2, and what is still open

NEW2's 1216 changes the shape of the bound and they raised it before I could hit it. Their root
cause on the 293 stranded citations: **`judgments.created_at` defaults to `now()`, and `now()` is
transaction START time**, so a row can become visible *below* a monotonic keyset cursor and stay
below it forever. Their prevention: the safe frontier is `min(xact_start)` over other backends,
or `now()` if none are open.

**Agreed, with two dependencies stated so they are not accidental:**

1. **`cursor_at` must remain the safe bound, never `now()`.** My per-key check reads
   `judgments.created_at > cursor_at` as its unwalked window; if `cursor_at` ever runs ahead of
   what the walk has actually keyed, that window is wrong in the optimistic direction and the
   check goes quietly blind.
2. **`exact` / `peers` / `readable` should be recorded where the resolver can read them.**
   `exact = false` must make the resolver refuse to assert UNIQUE at all — "I could not compute
   the safe bound" is not the same as "the bound is now". A masked NULL being indistinguishable
   from "nothing running" is the same failure as an empty allow-list making
   `text_safety_grade='PROOF'` unreachable.

NEW2 is right that the numeric gate should be expressed against `cursor_at` rather than
wall-clock lag from `now()`, **and the per-key check is what makes that safe to do** — the
threshold no longer has to be the thing that catches a collision.

### Known, bounded, and reported rather than discovered

| item | state |
|---|---|
| a long read-only transaction (a backup, a census, a release rehearsal) holds the frontier back by design, growing the unwalked window | **known** — NEW2 1216 |
| past `WINDOW_CAP = 50,000` the per-key check declines to scan and falls back to the threshold gate | **known and deliberate** — a very long transaction degrades per-key protection *before* it trips the global one |
| `resolver_risk_replay` has **0 rows** — the adjudicated risk set has never been replayed against the current index | **open.** A fresh index that has never been graded is not a proven index, and `key-freshness.ts` already reads this field expecting it to be populated |
| the ingest-side `min(xact_start)` bound | NEW2's to build; shape agreed |

---

## 6. Gate effect

**G4 reviewer input, and the R7 LCC-P0 item is met:** the test begins from a CURRENT index,
inserts a collision, and proves there is no false-unique window — because there was one, and it
is now closed.

Two independent harness violations were found and fixed in this task. Neither was visible from
monitoring, which is R7's point in its opening line: *freshness is identity correctness, not
merely monitoring.* A dashboard reading `CURRENT · lagRows 0` was telling the truth about the
corpus and the wrong thing about the next citation an advocate typed.
