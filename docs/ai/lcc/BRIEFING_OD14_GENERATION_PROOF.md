# BRIEFING OD-14 — GENERATION PROOF

**Lane:** LCC · **Task:** LCC-1 (P0) · **Date:** 23 Aug 2026
**Status:** CLOSED, proven on the real HTTP path.

---

## 1. What was wrong

`GET /briefings/:id` returns two halves that both describe the same authority:

| half | how it was produced | OD-14 applied? |
| --- | --- | --- |
| `briefing.authorities[]` | re-read LIVE on every request | **yes** (fixed 22 Aug, on NEW3 bus 1018) |
| `briefing.blocks.checklist[]` | GENERATED at the 23:00 sweep, stored in `briefings.content` | **no** |

`briefings/assemble.ts` built the checklist by branching on the stored column:

```ts
AND overruled_status <> 'none'
...
m.overruled_status === 'set_aside'
  ? `${m.case_title} has been set aside. Do not rely on it — find a replacement
     authority before the hearing.`
  : `${m.case_title} carries a changed status (${m.overruled_status}). ...`
```

For the **73 judgments OD-14 exists for** — stored `overruled_status =
'set_aside'`, verified inbound edge `overruled` — both halves of that sentence
are false. A later bench held the *proposition* is no longer good law; nothing
in that case was set aside, the decision between the original parties stands,
and the authority is frequently still citable for propositions the overruling
court never reached.

So one JSON response said `canAddToMatter: true` and, four keys away, told the
advocate to find a replacement.

### The second defect, found while fixing the first

Fixing the sweep is **not sufficient**, and this had not been stated anywhere.
`blocks.checklist` is served **verbatim from the stored blob**
(`route.ts`: `blocks: content.blocks ?? null`) while `authorities[]` beside it is
read live. A status that changes *after* the sweep therefore left the two halves
disagreeing however correct the sweep was — and asymmetrically, in the dangerous
direction:

> **an authority SET ASIDE overnight got its live banner and no checklist item at
> all**, because only the sweep ever wrote one.

---

## 2. What changed

Two new modules, so the derivation *and* the sentence are shared rather than
re-implemented:

- **`services/api/src/judgments/treatment-lookup.ts`** — the batched READ.
  `precedential-effect.ts` already centralised the decision; what it could not
  centralise was the two-query shape that gets its inputs, which is why every
  surface wrote that pair itself and OD-14 had to be applied to each separately.
  Decides nothing; returns `{ storedStatus, effect, policy, scope,
  overruledParas, unapplied }` per id.
- **`services/api/src/briefings/treatment-checklist.ts`** — the one place a
  checklist sentence about standing is written. Called by the sweep **and** by
  the render path.

`GET /briefings/:id` now **rewrites** the `authority-moved-*` items from the same
`PrecedentialState` the authority block was rendered from. Every non-treatment
item (unconfirmed date, missing order) is served exactly as generated — those
are facts about the matter at 23:00, and re-deriving them would be the read route
quietly regenerating a briefing. The stored copy is still written and still
correct at generation, because a briefing must be readable with the network off;
offline is the one case where a stale checklist is unavoidable and it is shown
with `asOf`, never as current.

### The sentence now

| effect | checklist text |
| --- | --- |
| `overruled` | *"X has moved: a later bench overruled the proposition; this decision itself stands. Which propositions were affected is not recorded — read the later decision. **It may still be relied on for propositions the later court did not reach** — check which before the hearing."* |
| `set_aside` | *"X has moved: this judgment was set aside — the decision between the parties is gone. **Do not rely on it — find a replacement authority** before the hearing."* |

`basis` names **both** inputs — `precedentialEffect = overruled
(judgments.overruled_status = set_aside; scope UNRESOLVED)` — because a stored
`set_aside` explained by an edge and one explained by nothing are different
situations a reader of the blob must be able to tell apart.

**No affected paragraph is ever invented.** `scope` is passed through from
`treatmentScope`; `UNRESOLVED` says so in words rather than implying the whole
judgment fell.

---

## 3. Three other surfaces were running the same stale rule

The repo-wide search LCC-1 asks for found the defect was **not one route**. Four
independent reimplementations of one policy, all in *decision* paths:

| file | what it did | what it cost |
| --- | --- | --- |
| `briefings/assemble.ts` | generated checklist branched on the stored column | the named defect |
| `judgments/annotations.ts:129` | `body.matterId && overruled_status === 'set_aside'` → 409 | **annotating into a matter IS add-to-matter.** `POST /matters/:id/authorities` derives the effect and *allows* these 73; this route refused them. Same authority, same matter, same second, allowed at one door and refused at the other — with a message asserting a set aside that did not happen. |
| `documents/route.ts:207` | refused a draft citation on the stored column | a draft is where the advocate acts on the answer, so it was the most expensive place to give a different one |
| `arguments/counter.ts:110` | filtered on `overruledStatus !== 'set_aside'` | **filtered on the BANNER.** `retrieve.ts` sends `policy.bannerStatus`, and `precedential-effect.ts` keeps an overruling at the strongest banner class *on purpose*. So these 73 were dropped from `authorities[]` into `excluded[]` — telling the advocate an authority their **opponent can reach for** is gone. The dangerous direction: not a refusal to act, a claim that adverse law is absent. |

All four now go through `treatment-lookup.ts`. `counter.ts` filters on
`canAddToMatter` and sends `precedentialEffect` beside the unchanged
`reason: 'set_aside'` wire value (widening that enum is a client-visible change
RCC has not adopted).

**Inspected and deliberately NOT changed:**

- `premium/preview.ts:121` (`overruled_status <> 'none'`) — a COUNT of
  authorities carrying adverse treatment, not a policy decision. Correct as is.
- `citations/propagate-treatment.ts`, `citations/fanout.ts`,
  `ingest/src/treatment.ts`, `ingest/src/overruled-cli.ts` — WRITERS of the
  stored column. They are supposed to speak in its vocabulary.
- The **population** of the checklist. `unappliedTreatment` (a verified adverse
  edge the corpus has not applied — 2 judgments today) is still NOT promoted
  into a generated instruction. `precedential-effect.ts` is explicit that it is
  reported and never acted on, and turning it into one would be this lane
  broadening treatment semantics alone. `route.ts` already sends it, so it is
  not silent.
- No warning was weakened anywhere. `bannerStatus` for an overruling is still
  `set_aside`, and LAW MOVED still renders.

---

## 4. Evidence

### The fixture reproduces the defect

`assemble.test.ts` → *"does not tell the advocate to replace an authority whose
edge says overruled, not set aside"*. Ran it against **deliberately restored
pre-OD-14 semantics** in `treatment-checklist.ts` before trusting it:

```
✔ names an authority that has moved, in the checklist (3.7092ms)
✖ does not tell the advocate to replace an authority whose edge says overruled,
  not set aside (7.3273ms)
  AssertionError: an overruled authority whose own decision stands must not be
  marked for replacement
ℹ pass 7   ℹ fail 1
```

The temporary patch was reverted; `grep -c PRE_OD14` → `0`.

### Real path, one HTTP response

`briefings/route.test.ts` → *"checklist and live authorities cannot disagree
about the same authority"* asserts, on one `GET /briefings/:id` through the real
Hono app against the real database:

```
authorities[0].precedentialEffect === 'overruled'
authorities[0].canAddToMatter     === true
authorities[0].overruledStatus    === 'set_aside'      // warning NOT weakened
checklist['authority-moved-…'].text does NOT match /find a replacement authority/i
checklist['authority-moved-…'].text      matches /propositions the later court did not reach/i
```

And *"rewrites the stored checklist from live state…"* moves a judgment to
`set_aside` **between two reads of the same, unregenerated briefing** and proves
the item appears, that `canAddToMatter` goes false with it, and that
`date-unchecked` — generated last night — is untouched.

### Suites

```
src/briefings/assemble.test.ts                8 pass  0 fail
src/briefings/route.test.ts                   9 pass  0 fail
src/briefings/route.test.ts  +
src/documents/route.test.ts  +
src/arguments/counter.test.ts +
src/matters/authorities.test.ts +
src/judgments/precedential-effect.test.ts    54 pass  0 fail   (122.9s)
tsc --noEmit -p services/api                  clean
```

---

## 5. What this does NOT claim

- **No corpus row was rewritten.** No backfill, no `UPDATE` on the 73, no ALTER.
  The stored column still says `set_aside` and that is deliberate — LCC-1 says
  do not rewrite canonical stored historical evidence to make the UI agree.
- **The offline copy can still be stale.** A briefing read with the network off
  serves the 23:00 checklist. That is disclosed by `asOf` and is the same answer
  the harness already gives for a stale status; it is not fixed here and cannot
  be.
- **Not measured against the live 73.** The proof is on synthetic fixtures
  shaped like them. The population figure (73 / 17 / 8) is quoted from
  `precedential-effect.ts`'s own measurement of 21 Aug 2026 and was not re-run
  this round — `DEFER DB_SCAN` was standing.
- **Mobile is unverified from here.** `apps/mobile` is not this lane's to change
  and the client-side half of `blocksAddToMatter` is NEW3/RCC's (bus 1018).
  The server now sends `canAddToMatter` on the briefing authority, which is the
  field their fallback was waiting for.
