# RCC R25 — what was observed, and how

Round: final client integration, external deletion web resource, device matrix.
`HEAD_START = 6124b5f0` (= NEW3 R23 `INTEGRATION_BASE`, bus 1753).

## The claim this round exists to retire

RCC R24 (bus 1748) reported `R17_WRITE_E2E = PENDING_LCC` and said so plainly:
the client half of R17 §1 was written against a contract document, and the
server's write half did not exist. LCC R27 landed it at `693c12ba`. This round
runs the two halves against each other.

Everything below was observed from live HTTP responses and live database reads.
Nothing is inferred from a passing unit test.

## How the evidence was produced

`apps/mobile/e2e/` boots the real API in a separate process and drives
`apps/mobile/src/api/client.ts` **unmodified** against it. It is not part of
`pnpm test` — it needs a live Postgres, and a unit suite that silently depends on
a database fails for reasons unrelated to the change under review.

Two disposable corpus databases are built on the same server, `A` carrying the
fixture judgment and `B` not, with the USER role left on the development database
where `users`, `matters` and `matter_authorities` live. **One port serves both**,
choosing per request from a mutable handle, so a corpus rollback and its recovery
are the same client, the same base URL and the same saved row — which is exactly
the property R17 §1 asserts and exactly what a server restart would destroy.
The fixture shape is `services/api/src/matters/authorities-corpus-split.test.ts`'s.

The client's request path therefore crosses two physically separate databases
throughout: `STRICT_SPLIT_CLIENT_SMOKE` is that arrangement, achieved by handing
`createApp` two distinct handles rather than by setting `CORPUS_DATABASE_URL` and
`USER_DATABASE_URL` on a booted server. Same topology, different way in — stated
because it is not literally the production configuration.

### Two things a mock could not have said

- **"No fake authority was created"** has no response shape. A refusal and a
  refusal-that-secretly-wrote are identical over the wire, so the row count is
  read from the harness control port, which is on a second port the app client is
  never told the number of.
- **"No profile row was created"** likewise: `users` is counted directly.

## Results

| claim | result |
| --- | --- |
| available save → `201`, one row, hydrated authority | PASS |
| absent target, no live row → `409 CORPUS_TARGET_UNAVAILABLE` | PASS |
| absent target, same live row → `200 { unavailableAuthority }` | PASS |
| nothing written on either unavailable branch | PASS — `matter_authorities` stayed at 1 |
| the forbidden sentences never reach the advocate | PASS |
| existing saved row survives as a six-field shell | PASS — no title/court/date/citation on the wire |
| recovery: same `authorityId`, hydrated, no duplicate, no stale shell | PASS |
| `identity_only` deletion through the real screen | PASS |
| no profile row created by asking to be deleted | PASS — `users` count 0 |
| request written against `auth_id` with `user_id` NULL | PASS |
| R16 replay returns the same request, not a second | PASS |
| unauthenticated → `AUTH_REQUIRED`, nothing written | PASS |
| profile-backed deletion unchanged | PASS — same route, `user_id` non-null |

23 tests, 2 suites, 0 failures.

## The shipped binary

`expo export --platform android` under `NODE_ENV=production`, read back in **both
ASCII and UTF-16LE** because Hermes strings are UTF-16 and an ASCII-only grep of
a `.hbc` has reported shipped copy as absent here before:

```
PRESENT   "The corpus release this app is reading does not contain this judgment"
PRESENT   "Already saved to this matter. The corpus release"
PRESENT   "Request account deletion"        "Delete my account instead"
PRESENT   "#747064"
ABSENT    "no judgment with that id"        "authority not found"
ABSENT    "#8A8578"
ABSENT    "rcc-e2e-"   "lawmind_e2e_rcc"   "rcc-r25-e2e-secret"   "127.0.0.1:4319"
```

The last line is the one worth keeping: it proves the e2e harness ships in no
bundle, which is a claim its own header makes and could otherwise not support.
Export directory deleted after reading.

## Caveats, stated rather than omitted

- **`DEVICE = PENDING`.** `adb devices -l` listed nothing. No physical matrix row
  is claimed, and none is inferred from Jest, TypeScript or an export build —
  NEW3 R23 asked for exactly that discipline and it was followed.
- **The unit suite is green serially and was not green under contention.** Run
  concurrently with the e2e work, 5 `SearchScreen` render tests failed on
  timeouts; run alone, 109 suites / 1,260 tests / 0 failures. The failures are a
  property of the machine, not of the code, and they are recorded rather than
  quietly re-run away.
- **The teardown was wrong before it was right.** It answered `/shutdown`
  immediately and cleaned up on a microtask; jest then exited, Windows took the
  child with it, and the development database accumulated a fixture advocate and
  a fixture matter per run with nothing saying so. It now tears down *before*
  answering, reports what would not delete, and checks its own residue. Verified
  at zero rows and zero leftover databases after a full run.
- **`EXTERNAL_DELETE_WEB = BLOCKED_REPOSITORY_OWNER`**, and no mobile-hosted HTML
  route was invented to work around it. `docs/EXTERNAL_ACCOUNT_DELETION_WEB.md`
  carries the requirement.
