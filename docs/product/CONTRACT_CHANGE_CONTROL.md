# CONTRACT CHANGE CONTROL — the process, not a change

> **CURRENT (from 18 Sep 2026, SHIP S4-T0.1):** owner **SHIP**. Authority: Master
> Roadmap v7.4 §3.7 (Amendment A1). Future changes follow **§7** below. §1–§6
> describe the three-owner process (NEW3 decides, RCC files, LCC implements) that
> produced every ledger row up to `CCR-NEW3-R25-01`. Those rows stay as written.

**Historical owner (R13–R25):** NEW3. **Filed by:** RCC. **Implemented by:** LCC.
**Established:** 30 August 2026, NEW3 Sprint-2 R13.
**Authority at the time:** Master Roadmap v7.1 §7.4.

This file says how the frozen RCC API contract changes. It is the process. The
decisions live in [`CONTRACT_CHANGE_LEDGER.json`](CONTRACT_CHANGE_LEDGER.json),
one row per request, and no contract version moves without a row there.

---

## 0. WHY THIS EXISTS AT ALL

A frozen contract with no amendment path does not stay frozen — it gets edited
quietly, or it gets bypassed. Both have already happened in this repo:

- **Bypassed.** RCC bus 1557 re-measured `search.party_name_only`, found the
  registry row wrong, and correctly *reported* rather than edited. That was RCC
  doing the right thing without a process telling it to. The next lane may not.
- **Edited quietly.** LCC edited `ecourts.daily_pilot` inside
  `V1_CAPABILITY_REGISTRY_R12.json` — a NEW3-owned frozen artifact — on
  29 August. The edit was *correct*, was pre-authorised by that row's own
  `claimStatus` field, was disclosed in bus 1544, and offered to be reverted.
  It was still a lane writing inside another lane's frozen artifact, and it is
  the exact shape of change this process exists to route.

**Neither is punished and neither is repeated.** Both are recorded in the ledger
as retrospective rows so the process starts with its own history in it.

---

## 1. THE THREE ROLES, AND WHAT EACH MAY NOT DO

| Lane | May | May **not** |
|---|---|---|
| **RCC** | File a `CONTRACT_CHANGE_REQUEST`. Ship against any version NEW3 has released to it. | Self-serve. Consume an unreleased version. Treat an observed server shape as the contract. |
| **NEW3** | Decide `AMEND` / `DEFER` / `REJECT_WITH_ALTERNATIVE`. Increment the version. Release a version to RCC. | Amend silently. Amend without a ledger row. Amend into a shape no backend serves. |
| **LCC** | Implement an AMEND. Report that an implementation landed. | Change the contract. Decide a CCR. Edit a NEW3-owned frozen artifact. |

**The uncommitted-server-shape rule.** A shape observed on a running local API
is *evidence*, never the contract. The contract is what is committed and
versioned here. LCC's own R12b finding says the same thing from the other side:
*"A prose handoff is a claim; the ledger is the world."*

---

## 2. WHAT A `CONTRACT_CHANGE_REQUEST` MUST CONTAIN

Six fields. A request missing any of them is returned unread — not rejected,
returned, because an incomplete request cannot be decided and a guessed decision
is worse than a delayed one.

```
id                 CCR-<YYYY-MM-DD>-<nn>
endpoint           the route, exactly, with method
missing            the field, state or behaviour that is absent
rccFallback        what RCC does safely TODAY without it
severity           P0 | P1 | P2       (see §3)
affectedSurface    the screen or action a user reaches it through
userTruthImpact    what a user would wrongly believe if RCC guessed
```

`userTruthImpact` is the field that carries the weight. A missing field that
costs a spinner is a different object from a missing field that lets a screen
imply an authority is good law. **If `userTruthImpact` is "none", the request is
probably a feature request and should say so.**

---

## 3. SEVERITY — defined by what a user would believe, not by effort

| | Means | Timebox |
|---|---|---|
| **P0** | Without it, a surface states or implies something false about the law, a citation, or coverage. | Decided same day. An unresolved P0 blocks the gate. |
| **P1** | Without it, a surface is degraded, slow or confusing, but nothing it says is false. | Decided within the sprint. |
| **P2** | Quality, ergonomics, or a shape that will matter later. | Decided by the next gate. |

**A P0 is never DEFERRED.** It is AMENDed, or it is
`REJECT_WITH_ALTERNATIVE` where the alternative is a *refusal* RCC can render
honestly. "Ship it and we will fix it" is not one of the three decisions.

---

## 4. THE THREE DECISIONS

### `AMEND`
The contract version increments. The ledger row records:

```
priorVersion          the version this supersedes
newVersion            the version RCC may now consume
schemaDelta           the exact added/changed field, with its type and nullability
semanticDelta         what the field MEANS, in one sentence a client author can act on
capabilityImpact      which capability registry rows change state, or "none"
claimImpact           which claims register rows change status, or "none"
backendOwner          LCC, if a backend change is required; "none" if the shape already exists
releasedToRCC         true only once the backend implementation has landed AND been observed
```

**`releasedToRCC` is the gate that matters.** A version may exist, be numbered,
and not yet be consumable. RCC builds against released versions only. This is
what stops the contract becoming a wishlist.

**Amendments are additive by default.** A removed or narrowed field is a breaking
change and requires `minSupportedContract` to move, which is a separate decision
and is not taken inside a CCR.

### `DEFER`
The need is real, the answer is "not this sprint". The row records **what RCC
does in the meantime** and **the gate at which it is reconsidered**. A DEFER with
no reconsideration point is a silent REJECT and is not allowed.

### `REJECT_WITH_ALTERNATIVE`
The contract will not carry this, and here is the shape that serves the same user
need. **A bare REJECT is not a decision.** If NEW3 cannot name an alternative,
the honest decision is DEFER.

---

## 5. HOW A CAPABILITY OR A CLAIM MOVES AS A CONSEQUENCE

Contract, capability and claim are three registers and they move in one
direction only:

```
contract version  ──►  capability state  ──►  public claim
```

- A **contract amendment** may make a capability *representable*. It does not
  enable it.
- A **capability** moves to `ENABLED` only on named evidence (see
  [`V1_CAPABILITY_REGISTRY_R13.json`](V1_CAPABILITY_REGISTRY_R13.json)), and now
  **per platform**.
- A **claim** may be made only about a capability `ENABLED` on the platform the
  claim appears on.

Nothing travels the other way. A marketing need never enables a capability, and
an enabled capability never authorises a claim by itself.

---

## 6. FILING

RCC files by bus message to NEW3 with subject beginning `CCR:`, and the six
fields in the body. NEW3 writes the ledger row the same day and answers on the
bus with the decision and, if AMEND, the version RCC may consume and whether it
is released yet.

**A CCR is never decided in conversation.** If it is not in the ledger, it did
not happen.

---

## 7. FROM SPRINT 4 — SHIP-OWNED CHANGE CONTROL (roadmap v7.4 §3.7)

One agent, SHIP, now writes both sides of most contracts. That removes a
handoff. It does not remove the need for a frozen proposal and a separate
acceptance: **a contract is never "released" merely because SHIP wrote both
sides.**

### 7.1 Low / normal risk

1. **`CCR_PROPOSED`** — a ledger row, frozen **before** any implementation edit:

   ```
   id                      CCR-SHIP-<round>-<nn>
   currentContractVersion  the version in force
   exactProblem            what is wrong or missing, with evidence
   safeCurrentFallback     what users get today, safely, without the change
   userTruthImpact         what a user would wrongly believe without it ("none" → probably a feature request)
   proposedDelta           the exact additive or breaking change
   breaking                true | false (breaking moves minSupportedContract: separate decision)
   clientImpact            apps/mobile effect
   serverImpact            services/api effect
   testsRequired           the checks acceptance will run
   frozenAt                timestamp, before implementation
   ```

2. **`IMPLEMENT`** — SHIP implements against the frozen proposal only.
3. **`POST_IMPLEMENT_ACCEPTANCE`** — re-anchor HEAD, then a separate pass runs
   `testsRequired` against the frozen proposal and records the result on the row.
   Scope creep beyond the proposal is a new CCR, not an amendment of this one.

### 7.2 Legal / data semantics

If the change touches canonical legal truth, citation semantics, statute
semantics or retrieval truth states, **DATA independently reviews the semantic
contract** and records `dataSemanticReview` on the row before acceptance.

### 7.3 High risk

Authentication · authorization · deletion/erasure · sensitive-data routing ·
gate criteria · canonical legal mutation safety: invoke **`RED_READ_ONLY`** when
independent falsification is materially useful, and record `redReadOnly` on the
row either way. RED attacks. RED does not implement.

### 7.4 Unchanged

§3 severity, §4's rule that a DEFER names its reconsideration gate, §5's one-way
flow contract → capability → claim, and "if it is not in the ledger, it did not
happen". Filing is a ledger row plus, when DATA or RED must act, a bus message
(`CCR:` subject) to that lane.
