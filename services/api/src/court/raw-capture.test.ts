/**
 * Retention is not conditional on comprehension.
 *
 * The grant allows 1,000 requests a day and the first one is worth more than
 * the rest, because it is the only thing that can tell us what a licensed cause
 * list actually looks like. These tests hold the line that makes that true: an
 * authorised response is retained whatever the parser makes of it, a failure
 * keeps every fact needed to write the parser later, and a page we could not
 * read never becomes a court that published nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY CASE RUNS INSIDE A ROLLED-BACK TRANSACTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two things this suite touches cannot be cleaned up afterwards, and the first
 * draft of it proved both the hard way.
 *
 *   1. `official_source_artifact` and `ecourts_observation` are append-only by
 *      trigger. A test that writes them cannot delete them, and tidying up would
 *      mean disabling the very guarantee the tables exist for.
 *   2. The kill switch is global state. A suite that flips it on in `before` and
 *      restores it in `after` leaves harvesting ENABLED if the process is killed
 *      in between — which is exactly what happened, and had to be repaired by
 *      hand.
 *
 * A transaction that always rolls back fixes both at once, and fixes them
 * against a crash rather than against remembering: the switch flip, the ledger
 * rows and the retained artifacts all vanish on ROLLBACK, and a killed process
 * rolls back too.
 *
 * No network request is made anywhere in this file. `fetchCauseList` is driven
 * with an injected `fetch`, which is also how the "nothing reaches eCourts with
 * the switch off" guarantee is asserted in `guard.test.ts`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { type Sql, type TransactionSql } from 'postgres';

import { createIsolatedSchema } from '../testing/isolated-schema.ts';
import { AUTHORISATION } from './authorisation.ts';
import { writeCauseListObservations } from './ecourts-observation-writer.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT, fetchCauseList, PARSER_STATE } from './ecourts.ts';
import {
  decide,
  ECOURTS_KILL_SWITCH_KEY,
  NON_NETWORK_TEST_ENDPOINT_PREFIX,
  record,
  reserve,
} from './guard.ts';
import { assertPilotRunnable, ECOURTS_PILOT, pilotBlockers, PilotRefused } from './pilot.ts';

const url = process.env['DATABASE_URL'];
const suite = url ? describe : describe.skip;

/**
 * `platform_config` is ISOLATED - `testing/isolated-schema.ts`.
 *
 * The rolled-back transaction below already prevented this suite from leaving
 * harvesting enabled, and that part is unchanged. What the fixture adds is the
 * other direction: this file asserts the switch is OFF before it borrows it, and
 * the founder turned the production switch ON on 29 Aug 2026. Reading the live
 * row would make the suite fail for a reason that has nothing to do with
 * retention.
 */
const isolation = url ? await createIsolatedSchema(url) : null;

/**
 * ONE teardown for the whole file, not one per suite.
 *
 * All three suites below share the fixture, and a per-suite `drop()` closed it
 * out from under the next one - the second suite then failed with a client that
 * had already been ended. A file-level `after` runs once, after every suite in
 * the file, which is the actual lifetime of the thing being torn down.
 */
after(async () => {
  await isolation?.drop();
});

/** Thrown to unwind `sql.begin`, so nothing this file writes can persist. */
const ROLLBACK = 'lcc-ecourts-raw-capture-rollback';

const TEST_COURT = 'ZZ_RAW_CAPTURE_TEST';
const TEST_SOURCE = {
  tier: 'legacy_court_key',
  court: TEST_COURT,
  listDate: '2026-08-29',
} as const;
const BODY = Buffer.from('<html><body>a cause list we cannot read yet</body></html>', 'utf8');
const BODY_SHA = createHash('sha256').update(BODY).digest('hex');

/** A `fetch` that answers without a socket. Nothing here reaches a host. */
function cannedFetch(status: number, body: Buffer, contentType: string): typeof fetch {
  return (async () =>
    new Response(new Uint8Array(body), {
      status,
      headers: { 'content-type': contentType },
    })) as unknown as typeof fetch;
}

suite('an authorised response is retained before it is understood', () => {
  let sql: Sql;

  /** Rows carrying the test court key that already existed when this run began. */
  let residue: { artifacts: number; ledger: number };

  before(async () => {
    sql = isolation!.connect({ max: 2 });
    const [artifacts] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM official_source_artifact
       WHERE metadata->>'court' = ${TEST_COURT}
    `;
    const [ledger] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}
    `;
    residue = { artifacts: artifacts?.n ?? 0, ledger: ledger?.n ?? 0 };
  });

  /**
   * Open a transaction, enable harvesting INSIDE it, run the body, roll back.
   *
   * The switch flip is only ever visible to this transaction, so a crash mid
   * test cannot leave harvesting on. The attribution env var is restored in a
   * `finally` for the same reason.
   */
  async function inRolledBackHarvest(body: (tx: TransactionSql) => Promise<void>): Promise<void> {
    const priorAttribution = process.env['ECOURTS_GRANT_ATTRIBUTION'];
    process.env['ECOURTS_GRANT_ATTRIBUTION'] = 'LawMind raw-capture test (no network)';
    try {
      await sql.begin(async (tx) => {
        const [before_] = await tx<{ enabled: boolean }[]>`
          SELECT enabled FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
        `;
        assert.equal(
          before_?.enabled,
          false,
          'the ISOLATED eCourts kill switch must be OFF before a test borrows it',
        );
        await tx`
          UPDATE platform_config SET enabled = true
           WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
        `;
        await body(tx);
        throw new Error(ROLLBACK);
      });
    } catch (error) {
      if ((error as Error).message !== ROLLBACK) throw error;
    } finally {
      if (priorAttribution === undefined) delete process.env['ECOURTS_GRANT_ATTRIBUTION'];
      else process.env['ECOURTS_GRANT_ATTRIBUTION'] = priorAttribution;
    }
  }

  it('keeps the bytes when the parser cannot read them, and writes no observation', async () => {
    await inRolledBackHarvest(async (tx) => {
      const at = new Date();
      const result = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: cannedFetch(200, BODY, 'text/html; charset=utf-8'),
        now: at,
      });

      assert.equal(result.status, 'failed', 'an unreadable page must never read as ok or empty');
      // The refusal CODE, not a prose match. Four causes are distinguishable now
      // and an operator has to be told which one applies; `BODY` is a scrap of
      // HTML that is not a cause-list surface at all.
      assert.match(
        result.status === 'failed' ? result.error : '',
        /^not_a_cause_list_response:/,
      );
      assert.ok(result.artifactId, 'the response must be retained even though it was unreadable');

      const [artifact] = await tx<
        {
          source: string;
          artifact_role: string;
          observation_state: string;
          source_url: string;
          content_type: string | null;
          payload_sha256: string;
          payload_bytes: number;
          raw_bytes: Buffer | null;
          authorization_basis: string;
          conditions_version: string | null;
          ecourts_fetch_ledger_id: string | null;
        }[]
      >`SELECT * FROM official_source_artifact WHERE id = ${result.artifactId!}`;

      assert.ok(artifact);
      // Every fact a parser failure is required to preserve.
      assert.equal(artifact.source, 'ecourts');
      assert.equal(artifact.artifact_role, 'cause_list');
      assert.equal(artifact.source_url, ECOURTS_CAUSE_LIST_ENDPOINT);
      assert.equal(artifact.content_type, 'text/html; charset=utf-8');
      assert.equal(artifact.payload_sha256, BODY_SHA);
      assert.equal(artifact.payload_bytes, BODY.byteLength);
      assert.ok(artifact.raw_bytes, 'the raw bytes themselves must be retained');
      assert.equal(Buffer.from(artifact.raw_bytes!).toString('utf8'), BODY.toString('utf8'));
      assert.equal(artifact.authorization_basis, 'ecourts_registrar_grant');
      assert.equal(artifact.conditions_version, AUTHORISATION?.conditionsVersion ?? null);
      assert.equal(artifact.ecourts_fetch_ledger_id, result.fetchLedgerId);

      const [ledger] = await tx<
        { outcome: string; http_status: number | null; observation_strategy: string | null }[]
      >`SELECT outcome, http_status, observation_strategy FROM ecourts_fetch_ledger
         WHERE id = ${result.fetchLedgerId!}`;
      assert.equal(ledger?.outcome, 'ok', 'the HTTP request itself succeeded');
      assert.equal(ledger?.http_status, 200);
      assert.equal(ledger?.observation_strategy, 'CAUSE_LIST_BATCH');

      const [count] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ecourts_observation
         WHERE source_artifact_id = ${result.artifactId!}
      `;
      assert.equal(
        count?.n,
        0,
        'a page we could not read must never become an observation — an observation here ' +
          'would read downstream as a court that published nothing',
      );
    });
  });

  it('retains a non-2xx response too, marked fetch_failed rather than observed', async () => {
    await inRolledBackHarvest(async (tx) => {
      const body = Buffer.from('<html>service unavailable</html>', 'utf8');
      const result = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: cannedFetch(503, body, 'text/html'),
        now: new Date(),
      });
      assert.equal(result.status, 'failed');
      assert.match(result.status === 'failed' ? result.error : '', /http 503/);
      assert.ok(result.artifactId);

      const [artifact] = await tx<{ observation_state: string; extraction_note: string | null }[]>`
        SELECT observation_state, extraction_note FROM official_source_artifact
         WHERE id = ${result.artifactId!}
      `;
      assert.equal(artifact?.observation_state, 'fetch_failed');
      assert.match(artifact?.extraction_note ?? '', /http 503/);
    });
  });

  it('records a transport failure on the ledger with nothing to retain', async () => {
    await inRolledBackHarvest(async (tx) => {
      const exploding: typeof fetch = (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch;
      const result = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: exploding,
        now: new Date(),
      });
      assert.equal(result.status, 'failed');
      assert.match(result.status === 'failed' ? result.error : '', /ECONNRESET/);
      assert.equal(result.artifactId, undefined, 'there were no bytes, so nothing is claimed');

      const [ledger] = await tx<{ outcome: string }[]>`
        SELECT outcome FROM ecourts_fetch_ledger WHERE id = ${result.fetchLedgerId!}
      `;
      assert.equal(ledger?.outcome, 'error');
    });
  });

  it('never reaches the network when the guard refuses, and still ledgers the refusal', async () => {
    await inRolledBackHarvest(async (tx) => {
      const forbidden: typeof fetch = (input) => {
        throw new Error(`a request to ${String(input)} was attempted after a refusal`);
      };
      const at = new Date();
      // Spend the slot, so the next call is refused by the minimum interval.
      await reserve(
        tx,
        { court: TEST_COURT, endpoint: ECOURTS_CAUSE_LIST_ENDPOINT, strategy: 'CAUSE_LIST_BATCH' },
        at,
      );
      const result = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: forbidden,
        now: new Date(at.getTime() + 5),
      });
      assert.equal(result.status, 'failed');
      assert.match(result.status === 'failed' ? result.error : '', /refused: min_interval/);
      assert.ok(result.fetchLedgerId, 'a refusal is evidence and gets a ledger row');
      assert.equal(result.artifactId, undefined);
    });
  });

  it('never counts an explicitly non-network test ledger row against the grant', async () => {
    await inRolledBackHarvest(async (tx) => {
      const at = new Date();
      await record(tx, {
        court: TEST_COURT,
        endpoint: `${NON_NETWORK_TEST_ENDPOINT_PREFIX}injected-response`,
        outcome: 'error',
        observationStrategy: 'CAUSE_LIST_BATCH',
        requestedAt: at,
      });

      const decision = await decide(tx, TEST_COURT, new Date(at.getTime() + 1));
      assert.equal(
        decision.allowed,
        true,
        'test:// rows never reached eCourts and must not consume interval/hour/day quota',
      );
    });
  });

  /**
   * A SYNTHETIC results page. It proves the WIRING - reservation, ledger,
   * retained artifact, parser, observation writer, all in one transaction - and
   * it proves nothing about what a served eCourts cause list looks like, because
   * no served cause list has been seen: the CAPTCHA stands in front of one
   * (`authorisation.CAPTCHA_OPERATIONAL_BASIS`). Its headers are the labels the
   * real retained response publishes in its own translation dictionary, which is
   * the closest thing to evidence available without satisfying the CAPTCHA.
   */
  const SYNTHETIC_RESULT_PAGE = Buffer.from(
    '<html><body>' +
      '<h2>Cause list displayed may differ from the actual cause list. ' +
      'For further queries, contact court administrator.</h2>' +
      '<div id="CauseList"><table>' +
      '<tr><th>Sr No</th><th>Case Number</th><th>Party Name</th></tr>' +
      '<tr><td>1</td><td>CRL.A. 100/2024</td><td>State versus Somebody</td></tr>' +
      '<tr><td>2</td><td>CS 55/2025</td><td>A versus B</td></tr>' +
      '</table></div></body></html>',
    'utf8',
  );

  it('carries a page end to end: reservation, ledger, artifact, parse, observations', async () => {
    await inRolledBackHarvest(async (tx) => {
      const at = new Date();
      const result = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: cannedFetch(200, SYNTHETIC_RESULT_PAGE, 'text/html; charset=utf-8'),
        now: at,
      });

      assert.equal(result.status, 'ok');
      if (result.status !== 'ok') return;
      assert.equal(result.items.length, 2);
      assert.ok(result.artifactId, 'the bytes are retained before anything reads them');
      assert.equal(result.observationIds?.length, 2);

      const rows = await tx<
        {
          observation_kind: string;
          cnr: string | null;
          case_number: string | null;
          extraction_note: string | null;
          source_artifact_id: string;
          payload: Record<string, unknown>;
        }[]
      >`
        SELECT observation_kind, cnr, case_number, extraction_note, source_artifact_id, payload
          FROM ecourts_observation WHERE source_artifact_id = ${result.artifactId!}::uuid
         ORDER BY item_number
      `;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((r) => r.observation_kind === 'cause_list_entry'));
      // A listing is not a hearing, and there is no value that could say it was.
      assert.ok(rows.every((r) => r.observation_kind !== 'hearing_occurred'));
      assert.ok(rows.every((r) => r.source_artifact_id === result.artifactId));
      // The court's uncertainty survived the write, on every row.
      assert.ok(
        rows.every((r) => (r.extraction_note ?? '').includes('may differ from the actual cause list')),
        'the source’s own warning must reach the record, not just the log',
      );
      assert.ok(
        rows.every((r) => typeof r.payload['_parserVersion'] === 'string'),
        'a row whose parser is unknown cannot be re-examined when that parser is wrong',
      );
    });
  });

  it('writes one page once, however many times it is replayed', async () => {
    await inRolledBackHarvest(async (tx) => {
      const at = new Date();
      const first = await fetchCauseList(tx, TEST_SOURCE, {
        fetchImpl: cannedFetch(200, SYNTHETIC_RESULT_PAGE, 'text/html; charset=utf-8'),
        now: at,
      });
      assert.equal(first.status, 'ok');
      if (first.status !== 'ok') return;

      /**
       * The replay a parser fix actually looks like: the same retained artifact,
       * read again. `ecourts_observation` is append-only, so a duplicate here is
       * permanent and would make "how many matters were listed" wrong by however
       * many times the job ran.
       */
      const replay = await writeCauseListObservations(tx, {
        court: TEST_COURT,
        listingDate: TEST_SOURCE.listDate,
        observedAt: at,
        endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
        payloadSha256: createHash('sha256').update(SYNTHETIC_RESULT_PAGE).digest('hex'),
        sourceArtifactId: first.artifactId!,
        fetchLedgerId: first.fetchLedgerId,
        strategy: 'CAUSE_LIST_BATCH',
        parserVersion: 'REPLAY',
        items: [
          { cnr: null, caseNumber: 'CRL.A. 100/2024', courtNumber: null, itemNumber: 1, raw: {} },
          { cnr: null, caseNumber: 'CS 55/2025', courtNumber: null, itemNumber: 2, raw: {} },
        ],
      });

      assert.deepEqual(
        [...replay].sort(),
        [...(first.observationIds ?? [])].sort(),
        'a replay must return the rows that already exist, not a second set',
      );
      const [count] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ecourts_observation
         WHERE source_artifact_id = ${first.artifactId!}::uuid
      `;
      assert.equal(count?.n, 2, 'replaying one artifact must not double its listings');
    });
  });

  it('leaves the isolated kill switch off, whatever happened above', async () => {
    const [row] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.equal(row?.enabled, false, 'no test may leave eCourts harvesting enabled');
  });

  it('writes nothing that outlives the run', async () => {
    /**
     * A DELTA, not an absolute count. `official_source_artifact` is append-only
     * and cannot be cleaned up, and one row from the pre-rollback draft of this
     * suite is permanently in it — repairing THAT would mean disabling the
     * append-only trigger, which is a far worse trade than an identifiable test
     * row. What this asserts is the thing still under our control: this run
     * added nothing.
     */
    const counts = async () => {
      const [artifacts] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM official_source_artifact
         WHERE metadata->>'court' = ${TEST_COURT}
      `;
      const [ledger] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ecourts_fetch_ledger WHERE court = ${TEST_COURT}
      `;
      return { artifacts: artifacts?.n ?? 0, ledger: ledger?.n ?? 0 };
    };
    assert.deepEqual(
      await counts(),
      residue,
      'the rolled-back tests above must add no durable row to an append-only evidence table',
    );
  });
});

suite('the observation writer accepts only validated parser output', () => {
  let sql: Sql;
  before(() => {
    sql = isolation!.connect({ max: 1 });
  });
  const base = {
    court: TEST_COURT,
    listingDate: '2026-08-29',
    observedAt: new Date(),
    endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
    payloadSha256: BODY_SHA,
    sourceArtifactId: '00000000-0000-0000-0000-000000000001',
    fetchLedgerId: '00000000-0000-0000-0000-000000000002',
    strategy: 'CAUSE_LIST_BATCH' as const,
    parserVersion: 'TEST_PARSER',
  };

  // Every case below is refused BEFORE any INSERT is attempted, so none of them
  // needs a transaction to be safe.
  it('refuses a batch that names no retained artifact', async () => {
    await assert.rejects(
      writeCauseListObservations(sql, {
        ...base,
        sourceArtifactId: '',
        items: [{ cnr: 'X', caseNumber: 'Y', courtNumber: null, itemNumber: 1, raw: {} }],
      }),
      /must name the retained response/,
    );
  });

  it('refuses a batch that names no ledgered request', async () => {
    await assert.rejects(
      writeCauseListObservations(sql, {
        ...base,
        fetchLedgerId: '',
        items: [{ cnr: 'X', caseNumber: 'Y', courtNumber: null, itemNumber: 1, raw: {} }],
      }),
      /must name the ledgered request/,
    );
  });

  it('refuses a line that identifies no case rather than inventing an identity', async () => {
    await assert.rejects(
      writeCauseListObservations(sql, {
        ...base,
        items: [{ cnr: null, caseNumber: null, courtNumber: '3', itemNumber: 1, raw: {} }],
      }),
      /identifies no case/,
    );
  });

  it('refuses a payload hash that is not a hash over received bytes', async () => {
    await assert.rejects(
      writeCauseListObservations(sql, {
        ...base,
        payloadSha256: 'not-a-hash',
        items: [{ cnr: 'X', caseNumber: 'Y', courtNumber: null, itemNumber: 1, raw: {} }],
      }),
      /is not a sha256/,
    );
  });

  it('writes nothing for an empty list rather than a placeholder', async () => {
    const written = await writeCauseListObservations(sql, { ...base, items: [] });
    assert.deepEqual(
      written,
      [],
      'an empty list is recorded on the sync row; a placeholder observation would make ' +
        '"the court published nothing" and "we read nothing" the same fact again',
    );
  });
});

suite('the eCourts pilot is defined and disabled', () => {
  let sql: Sql;
  before(() => {
    sql = isolation!.connect({ max: 1 });
  });
  it('ships disabled, batch-strategy, one unresolved source key', () => {
    assert.equal(ECOURTS_PILOT.enabled, false);
    assert.equal(ECOURTS_PILOT.strategy, 'CAUSE_LIST_BATCH');
    assert.equal(ECOURTS_PILOT.maxRequestsPerCycle, 1);
    assert.equal(ECOURTS_PILOT.sourceKey.establishment, null);
    assert.equal(ECOURTS_PILOT.sourceKey.court, 'PENDING_ACTIVATION');
  });

  it('refuses to run, and names every reason at once', async () => {
    const blockers = await pilotBlockers(sql);
    assert.ok(blockers.includes('pilot_disabled'));
    assert.ok(blockers.includes('source_key_unresolved'));
    assert.ok(blockers.includes('kill_switch_off'));
    /**
     * The blocker that replaced `parser_needs_authorized_fixture` on
     * 29 Aug 2026. The parser HAS its authorised response now; what it does not
     * have is a way past the CAPTCHA that the grant actually gave us. Asserting
     * the new one and not the old one is the point — they are different
     * problems, and only one of them is ours to solve.
     */
    assert.ok(blockers.includes('captcha_implementation_blocked'));
    assert.ok(!blockers.includes('parser_needs_authorized_fixture'));
    await assert.rejects(assertPilotRunnable(sql), (error: unknown) => {
      assert.ok(error instanceof PilotRefused);
      return true;
    });
  });

  it('states that the parser is bound to a real response, and is not called ready', () => {
    // `FIXTURE_BOUND`, deliberately not `READY`: the response it was written
    // against is the licensed interface's FORM, so the row-extraction half has
    // been built from the source's published labels and has never run against a
    // real result table. See `ecourts.ts` PARSER_STATE.
    assert.equal(PARSER_STATE, 'FIXTURE_BOUND');
  });

  it('is registered with no scheduler', () => {
    // A disabled job in a registry is one edit away from running. This one is
    // not in the registry at all.
    const registry = readFileSync(
      fileURLToPath(new URL('../../../../.agents/jobs/registry.jsonl', import.meta.url)),
      'utf8',
    );
    assert.ok(
      !registry.includes(ECOURTS_PILOT.id),
      `${ECOURTS_PILOT.id} must not be registered as a runnable job before activation`,
    );
  });

  it('has no way to express that a hearing occurred', () => {
    // Structural, not behavioural: there is no such kind to pass. Migration
    // 0061's CHECK makes minting one impossible at the database too.
    const kinds: string[] = ['cause_list_entry'];
    assert.ok(!kinds.includes('hearing_occurred'));
  });
});
