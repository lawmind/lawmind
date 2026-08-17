# CX1 Premium Data Backend Lab

Generated: **2026-08-17T14:21:22.571Z**

## Scope

Synthetic offline Workstream K harness for premium matter-data backend behavior. It writes no production rows, makes no model calls, fetches no provider data, and does not propose a canonical migration.

## Proposed Shadow Shape Tested

- `case_observations`: append source observations keyed by source/court/CNR/source id, before adoption by any matter.
- `matter_events`: projected advocate-facing timeline only after a matter is linked.
- `legal_documents`: procedural documents are separated from citable judgments; `order` and `cause_list` classes are not citable.
- `matters`: latest-state cache only, derived from observations/events rather than treated as the source of truth.

## Synthetic Scenario Results

| Metric | Count |
|---|---:|
| Input observations | 10 |
| Unique linked observations | 8 |
| Duplicate observations collapsed | 1 |
| Unlinked observations retained | 1 |
| Timeline events | 8 |
| Legal documents projected | 2 |
| New orders detected | 1 |
| Tomorrow hearing triggers | 2 |
| Same-advocate date conflicts | 1 |

## Latest Matter State

| Matter | Status | Next hearing | Bench | Latest order |
|---|---|---|---|---|
| `matter-alpha` | active | 2026-08-18 | Bench B | doc-order-alpha-001 |
| `matter-gamma` | active | 2026-08-18 | Court 4 |  |
| `matter-omega` | disposed |  |  |  |

## Assertions

- PASS: duplicate observation collapsed
- PASS: unlinked observation retained outside matter timeline
- PASS: tomorrow hearing trigger exists for alpha
- PASS: bench change updates latest state
- PASS: new order detected without citable promotion
- PASS: judgment remains citable while procedural objects do not
- PASS: disposed state remains terminal despite late old listing
- PASS: same advocate same date conflict is detected

## Outputs

- JSON: `docs/ai/cx1-premium-backend-lab/premium-backend-lab.json`
- Scenario CSV: `docs/ai/cx1-premium-backend-lab/scenario-summary.csv`
- Readiness CSV: `docs/ai/cx1-premium-backend-lab/hearing-pack-readiness.csv`

## Boundary

Synthetic CX1 shadow lab only: no production DB reads/writes, no canonical schema/API/UI edit, no provider fetch, no model call, no legal advice, and no citation confirmation.
