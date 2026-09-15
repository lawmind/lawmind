# RCC R26 — execution checklist

`HEAD_START = c36c853f` · `INTEGRATION_BASE = 94950462` (LCC R29, mid-round)

| phase | state | evidence |
| --- | --- | --- |
| 0 · current product delta | DONE | route registry read from `apps/mobile/app/**`; 35 routes; no screen invented |
| 1 · search UX | APPROVED_NO_CHANGE | `searchTruth.ts` separates all six shapes; four distinct empty states; `total?` already optional |
| 2 · reader / legal evidence | PATCH | `JudgmentScreen` failure state split into `corpus_absent` / `fetch_failed` |
| 3 · saved authorities (R17) | RE-PROVED | `e2e/r17-corpus.e2e.test.ts` against live API + Postgres |
| 4 · matter workspace | APPROVED_NO_CHANGE | R16 keys, double-tap guard and adjournment unchanged and green |
| 5 · account / deletion | RE-PROVED | `e2e/identity-delete.e2e.test.tsx`; no profile row created |
| 6 · capability / platform truth | APPROVED_NO_CHANGE | iOS `search.party_name` DISABLED server-side; monitoring / statute / good-law all held |
| 7 · visual / UX quality | PATCH | `SettingsRow` accessibility role; ink-faint drift closed |
| 8 · physical Android | PENDING_DEVICE | `adb devices -l` run once, nothing attached |
| 9 · public delete web | BLOCKED_NON_CLIENT | no canonical public site in `apps/`; FQ-DELETE-WEB raised |
| 10 · store client state | UNCHANGED | targetSdk 36 from Gradle output; iOS image pinned; no production build run |
| 11 · test / build | DONE | typecheck · 111/1273 · e2e 24/24 · hex · sunlight · design rules |
| 12 · commit | DONE | GIT_COMMIT lease held; `apps/**` + owned docs only |

## Non-claims

- `DEVICE = PENDING`. No physical matrix row claimed.
- `APPLE_PRODUCTION_BUILD_PROOF = PENDING`. No production build run, none paid for.
- `PAID_INFRA_CREATED = NO`.
- `DB_MIGRATION = NO`. Nothing under `services/**`, `packages/db/**` or
  `migrations/**` was touched.
- The e2e harness proves the corpus REFUSAL path of `GET /judgments/:id`, not a
  working reader — its fixture schema cannot hydrate a judgment it does carry.

## Handed to LCC

- `scripts/check-retrieval-outcome-coverage.mjs` fails at `94950462` on
  `services/api/src/release/activation.ts` (two problems: no
  `deriveRetrievalOutcome`, no `onDegrade`). Pre-existing, LCC's lane, untouched
  by this round — the file is unmodified in the working tree and was last written
  by `5d84e870` (LCC R27).
