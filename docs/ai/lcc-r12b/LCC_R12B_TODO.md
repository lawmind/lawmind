# LCC R12b — LIVE CHECKLIST

**Round:** finish the eCourts half of R12 and close it out.
**Started:** 30 August 2026. **HEAD_BEFORE:** `0e68dd1`.
`[x]` = observed, not inferred.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified ·
`[!]` HOLD / blocked · `[-]` deliberately not done, with a reason.

---

## 8 (carried) — the offline request blueprint

- [x] `searchByCauselist.js` retained — **and it already had been**, at 17:35:04Z
      on 29 Aug, five hours before this session. The handoff's "never retained"
      was true of `__fixtures__/` and false of `official_source_artifact`.
- [x] `components.js`, `common_header.js`, `myscript.js`, `home.js`,
      `csrf-magic.js` retained and committed as fixtures
- [x] Executed OFFLINE with a recording transport that opens NO socket —
      `official-client-recorder.ts`, a `node:vm` sandbox with no `fetch` and no
      `XMLHttpRequest`
- [x] Captured: method, URL, content type, field names AND order, headers,
      `app_token` position, `ajax_req`, Referer, the state/district/complex/
      establishment chain, and civil/criminal
- [x] Four substitutions named; exactly two globals fell through
      (`alerts_array`, `bootstrap`) and the test asserts that set
- [x] Byte-diff published — `ECOURTS_REQUEST_DIFF_V2.md`
- [x] `TRANSCRIBED` rows remaining: **0**
- [x] `ECOURTS_OFFLINE_REQUEST_DIFF` = **RECONCILED, EVIDENCE = BYTES**

### Three real defects found and fixed

- [x] submit `est_code` — was the complex value's 2nd `@` segment, is the
      establishment SELECT (empty unless the complex flag is `Y`)
- [x] `selprevdays` — was hardcoded `'0'`, is derived from the requested date
- [x] `fillCauseList` reply key — was `court_list`, is `cause_list`
- [x] `court_name_txt` added; serialised field order matched
- [x] `listCourtEstablishments` added (`casestatus/fillCourtEstablishment`)

### One apparent defect that was something else

- [x] The `ajaxCall` header pair **ROTATES** — three distinct pairs in 5.4 hours,
      one rotation inside five minutes. R11's transcription was correct when
      made and went stale; R12 credited it with a fix it did not cause; R12b's
      own commit `5cd71a6` then called it "wrong", which is also incorrect.
- [x] `parseAjaxDelimeter` reads it live per session; both captures are fixtures
      and the test asserts they disagree
- [x] Corrected in `ECOURTS_AJAX_BLOCKER.md` §2 and in this file

## 10 — bounded live canary

- [x] Diagnostic requests bounded and ledgered — 18 total, all HTTP 200
- [x] One request-shape change per step
- [x] Guard, atomic quota, ledger-before-send, raw-before-parse, attribution,
      cookies, rotating `app_token`, spacing — all held on every request
- [x] All traffic inside `court/ecourts.ts` only
- [x] `LIVE_DIAGNOSTIC_REQUESTS` = 18 · `TOTAL_REAL_REQUESTS_DAY` = 56 of 1,000
- [!] **`CANARY` = NOT PASS.** `casestatus/fillDistrict` answers
      `{"errormsg":"…Invalid Request…!"}` and rotates the session. Eight
      hypotheses tested and refuted — `ECOURTS_AJAX_BLOCKER.md`. STOPPED under
      the three-failure bound rather than guessing a ninth.

## 11 — CAPTCHA implementation

- [x] Solver wired, measured (PaddleOCR 11/12 exact, retry -> ~99.3%)
- [x] Per-solve metrics defined and written to the canary receipt: raw OCR,
      normalized answer, length, accepted/rejected, image artifact id
- [x] A wrong-length read no longer CRASHES the canary — it consumed one bounded
      retry via `execFileSync` throwing on the solver's exit 1, discarding the
      session and every request already spent on it
- [x] A rejected CAPTCHA consumes one bounded retry and never raises the rate
- [!] **Never exercised against a live CAPTCHA** — the chain stops two requests
      earlier. `captcha.accepted = 0`, `rejected = 0`, and both stay honest.

## 12 — first real cause-list fixture

- [!] BLOCKED by §10. **0 served cause lists have ever been seen.**
- [x] The capture path is built and writes raw bytes to disk BEFORE the parser
      runs, so the first success cannot be lost to a parse failure
- [x] `PARSER_STATE` stays `FIXTURE_BOUND` — not upgraded on a hope

## 13 — observation writer

- [x] Exists and passes (5 tests) — NEW3's "build it" note was wrong
- [x] Idempotent replay wired into the canary: the same batch over the same
      artifact is written twice and must add nothing
- [!] Never run against a REAL parsed cause list. `REAL_OBSERVATIONS = 0`.

## 14 — canary to retention to daily pilot

- [!] `CANARY` NOT PASS, so retention and the pilot do not begin
- [-] **Retention probe deliberately NOT attempted**, and not only because §10
      blocks it: `datePickerIcon('causelist_date','+1m','-7')` shows the licensed
      interface offers **+1 month forward and 7 days back**. R12's T-30/T-90/T-365
      plan asks for dates the interface never offers. If the POST is ever
      accepted, probe **T, T-1, T-7 only**.
- [x] `RETENTION_HIGH_COURT` / `RETENTION_DISTRICT` = **UNMEASURED**, unchanged
- [x] `DAILY_PILOT` = DISABLED · `ECOURTS_SWITCH_FINAL` = ON (unchanged, audited)

## 16 — off-machine protection

- [x] Curated pack rebuilt — 35 tables, 1.587 GB
- [x] **Client-side encryption added.** The pack holds `matters`, `matter_events`,
      `documents`, `users` — sensitive-class under `CLAUDE.md` §5. R2's
      server-side encryption is a control Cloudflare holds the key to.
      `scripts/migration/encrypt-pack.mjs`, AES-256-GCM, key never uploaded.
- [x] Refuses honestly with no key (the `packages/auth/src/mail.ts` pattern) —
      observed, it printed a generated key and exited 2
- [x] Local encrypt -> decrypt round trip: sha256 **MATCH**
- [x] Uploaded: 6 files, 1.48 GB, 140 s
- [x] **Read back and compared byte for byte** — `0 differences found`, 93 s
- [x] **End-to-end proof**: one object pulled fresh from R2 and decrypted to a
      byte-identical plaintext (`f4e9e9f4…a1933`)
- [x] Rotation held at 3 backups; 1 old backup deleted
- [x] **Restore PROVEN for this exact pack** — `--skip-dump`, so it restored the
      pack already on disk rather than one taken seconds earlier. 35 tables,
      every row count `ok`, content checksum `5388aa9b…` MATCH, 685.2 s.
- [!] **The key exists only in `.env` on this workstation.** Confidentiality is
      up, recoverability is DOWN until it is escrowed. `FQ-BACKUP-KEY-ESCROW`.

## 18 — full verification

- [x] migration journal — OK, 100 migrations, ordered and unedited
- [x] schema truth — OK, 51 documented / 49 created / 2 deferred with reasons
- [x] API typecheck — clean
- [x] court + eCourts suites — **100/100**
- [x] network safety — **17 properties, 76 tests, PASS** (2 new properties)
- [x] json configs · contract status (105 endpoints) · amber reservation ·
      alert coverage · stop coverage · screened-not-clean · retrieval outcome
      coverage · design renders — all PASS
- [x] job health · lane bus 15/15 · resource gate 14/14 · query-log privacy 4/4
- [x] **`platform_config` fingerprint BEFORE and AFTER** — digest identical, no
      test-created production mutation survived
- [x] **Full API suite from final HEAD, bounded concurrency, NEW1 never stopped**
      — **948 tests, 944 pass, 2 skipped, 2 fail**, both run down:
  - [x] `casts no _at column to text anywhere in the service, unmarked` — a
        **REAL regression, shipped by R12 (`f2a14b5`)**. `judgments/route.ts:79`
        cast `provenance_recorded_at::text`, putting Postgres text on the wire
        where Hermes renders `Invalid Date`. It survived precisely because R12
        recorded this suite as NOT RUN at breadth. Fixed with `isoColumn()`;
        iso-time 11/11, judgments route 11/11, data-trust 7/7.
  - [x] `admits a globally common term inside a NARROW court+date population` —
        a LATENCY assertion (6,161 ms). It ran while the 685 s `pg_restore` was
        on the same database. Re-measured on a quiet box: **243 ms, 5/5 pass.**
        Contention, not a regression — verified, not assumed.
- [x] Moat pack RESTORE PROVEN — 35 tables, every row count `ok`, content
      checksum `5388aa9b…` MATCH, 685.2 s, run with `--skip-dump` against the
      pack already on disk
- [-] **`pnpm lint` FAILS — 6,121 errors, none mine.** All in NEW2's
      `services/ingest/.n2c-*.mjs` scratch files plus `decision-identity.ts` and
      `semantic-role.ts`. My 7 (`Buffer` undefined in the new script) are fixed;
      the six named files I touched lint clean. Not my lane to edit — reported,
      not silently fixed.

## Method notes this round paid for

- [x] **Query the artifact table before spending a request.** Seven of 18
      requests re-fetched what the database already held, because the handoff
      described `__fixtures__/` and I read it as describing the world.
- [x] **A stale transcription is not a wrong one.** Three agents in a row drew
      the wrong conclusion from the same rotating constant, in three different
      directions.
- [x] **A refusal by our own limiter looks like a fetch that worked.** The live
      delimeter read was silently refused for `min_interval` and fell back to the
      committed constant, and nothing said so until the wire bytes were printed.

## A residue this round did not create but did measure

The API suite leaves rows in `users` on every run against the live database.
Measured after this round: **542 rows = 278 erasure shells + 263
`@example.test` + the founder actor.** My run added 13 of them.

- The **278 `erased+<uuid>@invalid` shells are DELIBERATE and undeletable.**
  `erasure-fixture.test.ts` explains it in a comment written so nobody "fixes"
  the leak: `audit_log` refuses DELETE at the database (`audit_log_append_only()`
  raises 23001), and `audit_log.actor_user_id` is a plain FK with no
  `ON DELETE`, so the shell cannot go without breaking the audit row that must
  survive. The residue per run is exactly what production leaves for a real
  erased advocate, and carries nothing about a person by construction.
- The **263 `@example.test` rows are ordinary cleanup that some tests do and
  others do not.** They have accumulated since 22 August across every lane's
  runs, not this round.

Nothing was deleted. It is another lane's tests as much as mine, `platform_config`
was untouched (digest identical), and quietly tidying 263 rows out of a shared
database on the strength of a name pattern is exactly the kind of change that
should be proposed rather than performed.
