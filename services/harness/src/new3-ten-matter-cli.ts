/**
 * NEW3 — run the deterministic 10-matter product regression.
 *
 *   pnpm --filter @lawmind/harness product:ten
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A REGRESSION TEST, NOT A REPORT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The instrument is `createApp(...).request(...)` — the REAL Hono app, in
 * process. Not `hybridSearch` directly, and not a live server:
 *
 *   in-process app   exercises the 500-char validator, `answerStructured`'s
 *                    exact-identity gate, the embed budget, `hybridSearch`,
 *                    every auth middleware and every route guard
 *   not a live server  because "did you remember to start the API" is exactly
 *                    the kind of flake that makes a regression test get deleted
 *
 * `launch-benchmark-cli.ts` established this pattern and its reasoning holds
 * here unchanged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It never mutates the corpus.** No `overruled_status` is flipped to make an
 * alert fire, no treatment edge is rewritten, no judgment is inserted. Every
 * write is to `users`/`auth_user`/`matters`/`matter_events`/`matter_authorities`
 * under one greppable tag, and every one is deleted in a `finally`.
 *
 * That constraint is why M09 reports `ALERT_PATH_ONLY` instead of a green tick:
 * `alerts` holds zero rows corpus-wide, firing one honestly requires a corpus
 * mutation, and a test that fakes its own precondition is measuring itself.
 *
 * **It never turns a premium flag on by default.** Premium surfaces default OFF
 * (`premium/gate.ts`) and that is the safe configuration, not a defect. A 404
 * from a premium route scores `N/A` with its reason. `PREMIUM_LOCAL=1` opts in
 * for a local run and restores the exact prior rows in a `finally`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHECKPOINTED AFTER EVERY MATTER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 160 of 283 queries were lost once to a teardown because the write was at the
 * end of the run (`launch-benchmark-cli.ts`). Same rule here: one JSONL line per
 * matter, flushed immediately. A run that dies at matter 7 leaves six matters of
 * real evidence.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { signAccessToken } from '@lawmind/auth';
import { createApp } from '@lawmind/api/app';

import { sslFor } from './db-url.ts';
import {
  authIdFor,
  emailFor,
  FIXTURE_HEARING_DATE,
  FIXTURE_TAG,
  TEN_MATTERS,
  type Invariant,
  type MatterFixture,
} from './new3-ten-matter-fixture.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));

const OUT = abs(process.env['OUT'] ?? 'docs/ai/new3/ten-matter-regression.json');
const CKPT = abs(process.env['CKPT'] ?? 'docs/ai/new3/ten-matter-regression.checkpoint.jsonl');

/** Every request is raced against this. A hang is a product outcome. */
const PER_REQUEST_MS = Number(process.env['PER_REQUEST_MS'] ?? 45_000);
const STATEMENT_MS = Number(process.env['STATEMENT_MS'] ?? 40_000);
const PREMIUM_LOCAL = process.env['PREMIUM_LOCAL'] === '1';

/**
 * The secret is a constant, and that is deliberate.
 *
 * It signs tokens for throwaway rows that exist for seconds inside one process
 * and never reaches a network. A random one per run would make a failed run's
 * artifact un-replayable, which is the property this whole file is for.
 */
const SECRET = 'new3-ten-matter-regression-secret-0123456789';

type StepResult = {
  step: string;
  status: number | null;
  ms: number;
  ok: boolean;
  /** The whole response body. Retained — this is the raw artifact. */
  body: unknown;
  /** Set when the step could not run at all (timeout, throw, skipped). */
  note?: string;
};

type MatterResult = {
  key: string;
  scenario: string;
  ranAt: string;
  /**
   * Re-asserted BEFORE anything is scored.
   *
   * `checked` is separate from `held` on purpose. An invariant the database
   * refused to answer (a 57014 under load) is NOT the same fact as an invariant
   * that came back wrong, and collapsing them would make a contended box look
   * like a corpus change. Unchecked suppresses the score without claiming drift.
   */
  invariants: { invariant: Invariant; checked: boolean; held: boolean; observed: unknown }[];
  fixtureDrift: boolean;
  invariantsUnchecked: boolean;
  steps: StepResult[];
  /** Cheap machine-checkable facts a human reads alongside `acceptance`. */
  observations: Record<string, unknown>;
};

const sleep0 = () => new Promise((r) => setImmediate(r));

async function withTimeout<T>(ms: number, work: () => Promise<T>): Promise<T | 'TIMEOUT'> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<'TIMEOUT'>((resolve) => {
    timer = setTimeout(() => resolve('TIMEOUT'), ms);
  });
  try {
    return await Promise.race([work(), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Nothing was run.');
    return 2;
  }

  const sql = postgres(url, {
    max: 4,
    onnotice: () => {},
    ssl: sslFor(url),
    connection: { statement_timeout: STATEMENT_MS },
  });

  const app = createApp({
    ping: async () => {
      await sql`SELECT 1`;
    },
    // No embedder: the dense arm is a separate measurement and NEW1 owns it.
    // Recorded in the artifact so nobody reads these numbers as a dense result.
    search: { sql, embedQuery: async () => null },
    auth: { auth: null as never, sql, secret: SECRET },
  });

  mkdirSync(dirname(CKPT), { recursive: true });
  writeFileSync(CKPT, '');

  const results: MatterResult[] = [];
  /** Restored in the finally, exactly as found. */
  let premiumRestore: { key: string; enabled: boolean }[] | null = null;

  try {
    if (PREMIUM_LOCAL) {
      premiumRestore = (await sql<{ key: string; enabled: boolean }[]>`
        SELECT key, enabled FROM platform_config
        WHERE kind = 'flag' AND key LIKE 'premium%'`).map((r) => ({ ...r }));
      await sql`UPDATE platform_config SET enabled = true
                WHERE kind = 'flag' AND key LIKE 'premium%'`;
    }

    for (const fixture of TEN_MATTERS) {
      /**
       * One matter cannot take the run down.
       *
       * The first run of this file died on matter 5's invariant query and threw
       * away matters 6-10, which is the same failure the checkpointing exists to
       * prevent — just one level up. A matter that throws is recorded as a
       * matter that threw.
       */
      let result: MatterResult;
      try {
        result = await runMatter(app, sql, fixture);
      } catch (error) {
        result = {
          key: fixture.key,
          scenario: fixture.scenario,
          ranAt: new Date().toISOString(),
          invariants: [],
          fixtureDrift: false,
          invariantsUnchecked: true,
          steps: [
            {
              step: 'matter_aborted',
              status: null,
              ms: 0,
              ok: false,
              body: null,
              note: error instanceof Error ? error.message : String(error),
            },
          ],
          observations: { aborted: true },
        };
      }
      results.push(result);
      appendFileSync(CKPT, `${JSON.stringify(result)}\n`);
      console.log(
        `${fixture.key.padEnd(26)} drift=${result.fixtureDrift ? 'YES' : 'no '} ` +
          `steps=${result.steps.filter((s) => s.ok).length}/${result.steps.length}`,
      );
      await sleep0();
    }
  } finally {
    await cleanup(sql);
    if (premiumRestore) {
      for (const row of premiumRestore) {
        await sql`UPDATE platform_config SET enabled = ${row.enabled}
                  WHERE kind = 'flag' AND key = ${row.key}`;
      }
    }

    const artifact = {
      runAt: new Date().toISOString(),
      instrument: 'createApp in-process (real Hono app, real routes)',
      denseArm: 'DISABLED — embedQuery returns null. These are lexical/exact-route numbers only.',
      premiumFlags: PREMIUM_LOCAL ? 'temporarily enabled for this run, restored' : 'left as found',
      matters: results,
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`\nartifact  ${OUT}\ncheckpoint ${CKPT}`);
    await sql.end();
  }

  const drifted = results.filter((r) => r.fixtureDrift).map((r) => r.key);
  if (drifted.length > 0) {
    console.error(`\nFIXTURE DRIFT on ${drifted.join(', ')} — scores withheld for these.`);
    return 1;
  }
  return 0;
}

async function checkInvariant(
  sql: postgres.Sql,
  inv: Invariant,
): Promise<{ held: boolean; observed: unknown }> {
  switch (inv.kind) {
    case 'judgment_column': {
      const [row] = await sql<Record<string, unknown>[]>`
        SELECT ${sql(inv.column)} AS v FROM judgments WHERE id = ${inv.judgmentId}`;
      const observed = row ? (row['v'] as string | null) : undefined;
      return { held: observed === inv.equals, observed };
    }
    case 'treatment_edge': {
      const [row] = await sql<{ relationship: string; treatment_provenance: string | null }[]>`
        SELECT relationship, treatment_provenance FROM judgment_citations WHERE id = ${inv.edgeId}`;
      return {
        held:
          row?.relationship === inv.relationship && row?.treatment_provenance === inv.provenance,
        observed: row ?? null,
      };
    }
    case 'neutral_citation_count': {
      /**
       * `LIMIT`, not `COUNT(*)`.
       *
       * A bare count over an 18.7M-row table is a full scan, and it killed the
       * first run of this file with a 57014 while the box was contended and the
       * resource gate read `DEFER DB_SCAN`. The question is "does this citation
       * name more than one judgment", which a bounded read answers exactly —
       * and an unbounded query that only works on a quiet box is not a
       * regression test, it is a regression test that gets deleted.
       */
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM judgments WHERE neutral_citation = ${inv.neutralCitation}
        LIMIT ${inv.equals + 3}`;
      return { held: rows.length === inv.equals, observed: rows.length };
    }
    case 'sole_treatment_driver': {
      const rows = await sql<{ id: string; relationship: string }[]>`
        SELECT id, relationship FROM judgment_citations
        WHERE cited_judgment_id = ${inv.judgmentId}
          AND relationship IN ('overruled','overruled_in_part','set_aside','doubted')`;
      return { held: rows.length === 1 && rows[0]?.id === inv.edgeId, observed: rows };
    }
  }
}

async function runMatter(
  app: ReturnType<typeof createApp>,
  sql: postgres.Sql,
  fx: MatterFixture,
): Promise<MatterResult> {
  const steps: StepResult[] = [];
  const observations: Record<string, unknown> = {};

  const invariants: MatterResult['invariants'] = [];
  for (const inv of fx.invariants) {
    try {
      invariants.push({ invariant: inv, checked: true, ...(await checkInvariant(sql, inv)) });
    } catch (error) {
      invariants.push({
        invariant: inv,
        checked: false,
        held: false,
        observed: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  const fixtureDrift = invariants.some((i) => i.checked && !i.held);
  const invariantsUnchecked = invariants.some((i) => !i.checked);

  const authId = authIdFor(fx.key);
  const email = emailFor(fx.key);
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'NEW3 Fixture', ${email}, true)
            ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
            VALUES (${authId}, 'NEW3 Fixture', '+911111100000', ${email}, 'unverified')
            ON CONFLICT (auth_id) DO NOTHING`;
  const token = await signAccessToken({ sub: authId, email }, SECRET);
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const call = async (
    step: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<StepResult> => {
    const started = Date.now();
    const raced = await withTimeout(PER_REQUEST_MS, async () => {
      const res = await app.request(path, {
        method: init?.method ?? 'GET',
        headers: h,
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = { unparseable: true };
      }
      return { status: res.status, body };
    });
    const ms = Date.now() - started;
    const out: StepResult =
      raced === 'TIMEOUT'
        ? { step, status: null, ms, ok: false, body: null, note: `timed out at ${PER_REQUEST_MS}ms` }
        : { step, status: raced.status, ms, ok: raced.status < 400, body: raced.body };
    steps.push(out);
    return out;
  };

  const data = (s: StepResult): Record<string, unknown> => {
    const b = s.body as { ok?: boolean; data?: Record<string, unknown> } | null;
    return b?.ok && b.data ? b.data : {};
  };

  // ── 1. SEARCH ──────────────────────────────────────────────────────────────
  const search = await call('search', '/search', {
    method: 'POST',
    body: { query: fx.query, language: 'en' },
  });
  const sd = data(search);
  const results = Array.isArray(sd['results']) ? (sd['results'] as Record<string, unknown>[]) : [];
  observations['resultCount'] = results.length;
  observations['ambiguous'] = sd['ambiguous'] ?? false;
  observations['degraded'] = sd['degraded'] ?? [];
  observations['page'] = sd['page'] ?? null;
  observations['topResult'] = results[0]
    ? {
        judgmentId: results[0]['judgmentId'],
        caseTitle: results[0]['caseTitle'],
        neutralCitation: results[0]['neutralCitation'],
        court: results[0]['court'],
      }
    : null;
  observations['returnedJudgmentIds'] = results.map((r) => r['judgmentId']);
  /** M08's whole question. Cheap, and checked on every matter, not just M08. */
  observations['testCourtRowsInResults'] = results.filter((r) => r['court'] === 'Test Court').length;
  if (fx.anchorJudgmentId) {
    const rank = results.findIndex((r) => r['judgmentId'] === fx.anchorJudgmentId);
    observations['anchorRank'] = rank === -1 ? null : rank + 1;

    /**
     * When the advocate's own phrasing misses, ask the same question by citation.
     *
     * Without this, a miss is unattributable: "we do not hold it", "it is not
     * indexed" and "your wording left the exact-identity route" all look the
     * same, and they need three different fixes from three different lanes. M01
     * is the live example — "Kharak Singh v State of Uttar Pradesh surveillance"
     * returned five results and none was Kharak Singh, and the difference from a
     * bare title search is one topic word.
     */
    if (rank === -1) {
      const [anchor] = await sql<{ neutral_citation: string | null; case_title: string }[]>`
        SELECT neutral_citation, case_title FROM judgments WHERE id = ${fx.anchorJudgmentId}`;
      const probe = anchor?.neutral_citation ?? anchor?.case_title ?? null;
      if (probe) {
        const retry = await call('search_anchor_probe', '/search', {
          method: 'POST',
          body: { query: probe.slice(0, 500), language: 'en' },
        });
        const rd = data(retry);
        const rr = Array.isArray(rd['results']) ? (rd['results'] as Record<string, unknown>[]) : [];
        const probeRank = rr.findIndex((r) => r['judgmentId'] === fx.anchorJudgmentId);
        observations['anchorProbeQuery'] = probe;
        observations['anchorProbeRank'] = probeRank === -1 ? null : probeRank + 1;
      }
    }
  }

  // ── 2. OPEN THE JUDGMENT + ITS CURRENTNESS ────────────────────────────────
  const openId =
    fx.anchorJudgmentId ?? (results[0]?.['judgmentId'] as string | undefined) ?? null;
  observations['openedJudgmentId'] = openId;
  if (openId) {
    const jd = data(await call('judgment', `/judgments/${openId}`));
    observations['judgmentOverruledStatus'] = jd['overruledStatus'] ?? null;
    observations['judgmentDateQuality'] = jd['dateQuality'] ?? null;
    const td = data(await call('treatment', `/judgments/${openId}/treatment`));
    const rows = Array.isArray(td['treatments'])
      ? (td['treatments'] as Record<string, unknown>[])
      : Array.isArray(td['rows'])
        ? (td['rows'] as Record<string, unknown>[])
        : [];
    observations['treatmentRowCount'] = rows.length;
    observations['treatmentRelationships'] = rows.map((r) => r['relationship']);
    /** Does provenance reach the wire at all? M02 vs M03 is decided here. */
    observations['treatmentProvenanceOnWire'] = rows.some(
      (r) => r['treatmentProvenance'] !== undefined || r['provenance'] !== undefined,
    );
  }

  // ── 3. MATTER ─────────────────────────────────────────────────────────────
  const created = await call('create_matter', '/matters', {
    method: 'POST',
    body: { ...fx.matter, nextHearingDate: FIXTURE_HEARING_DATE },
  });
  /**
   * `data.matter.matterId`. Not `data.id`, and not `data.matter.id`.
   *
   * Two runs read this key wrong, got `undefined`, and SILENTLY SKIPPED five
   * steps — save-authority, list, timeline, premium preview and briefings —
   * while every step that did run returned 200 and the run reported success.
   * That is the instrument failing in the one direction an acceptance test must
   * never fail: quietly measuring less than it claims, and looking greener for
   * it. `matter_id_missing` is now a recorded step so the artifact can never
   * again show a pass that skipped half the workflow.
   */
  const matterId = (data(created)['matter'] as { matterId?: string } | undefined)?.matterId;
  observations['matterCreated'] = Boolean(matterId);
  /**
   * `parties` comes back as a JSON STRING, not the object that was sent.
   * Recorded on every run rather than asserted, because it is a wire-shape
   * question for the contract owners, not a product verdict of this lane's.
   */
  observations['partiesWireType'] = typeof (
    data(created)['matter'] as { parties?: unknown } | undefined
  )?.parties;
  if (!matterId) {
    steps.push({
      step: 'matter_id_missing',
      status: created.status,
      ms: 0,
      ok: false,
      body: created.body,
      note: 'no matter id on the wire — every matter-scoped step below was skipped',
    });
  }

  if (matterId) {
    // ── 4. SAVE THE AUTHORITY. `set_aside` is expected to REFUSE (M02/M03/M04).
    if (openId) {
      const saved = await call('save_authority', `/matters/${matterId}/authorities`, {
        method: 'POST',
        body: { judgmentId: openId },
      });
      observations['saveStatus'] = saved.status;
      observations['saveRefusedCode'] =
        (saved.body as { error?: { code?: string } } | null)?.error?.code ?? null;
      const listed = data(await call('list_authorities', `/matters/${matterId}/authorities`));
      const auth = Array.isArray(listed['authorities'])
        ? (listed['authorities'] as Record<string, unknown>[])
        : [];
      observations['authoritiesOnMatter'] = auth.length;
      observations['authorityStates'] = auth.map((a) => ({
        verificationState: a['verificationState'],
        verifiedBySource: a['verifiedBySource'],
        overruledStatus: a['overruledStatus'],
      }));
    }

    // ── 5. TIMELINE ─────────────────────────────────────────────────────────
    await call('matter_event', `/matters/${matterId}/events`, {
      method: 'POST',
      body: {
        eventDate: FIXTURE_HEARING_DATE,
        eventType: 'hearing',
        notes: fx.advocateIntent,
      },
    });

    // ── 6. PREMIUM PREVIEW. 404 when the flag is off — that is CORRECT. ─────
    const preview = await call('premium_preview', `/matters/${matterId}/premium-preview`);
    observations['premiumPreviewStatus'] = preview.status;
    if (preview.status === 404) {
      observations['premiumPreview'] = 'N/A — flag off, which is the safe default';
    } else {
      const pd = data(preview);
      observations['premiumPreview'] = {
        authorityCount: pd['authorityCount'],
        eventCount: pd['eventCount'],
        adverseAuthorities: pd['adverseAuthorities'],
        stanceNotComputed: pd['stanceNotComputed'],
        costClass: pd['costClass'],
      };
    }

    // ── 7. BRIEFINGS ────────────────────────────────────────────────────────
    const briefs = data(await call('briefings', `/matters/${matterId}/briefings`));
    observations['briefingCount'] = Array.isArray(briefs['briefings'])
      ? (briefs['briefings'] as unknown[]).length
      : 0;
  }

  // ── 8. COUNTERARGUMENT ────────────────────────────────────────────────────
  const counter = await call('counter', '/arguments/counter', {
    method: 'POST',
    body: {
      position: fx.counterPosition,
      language: 'en',
      ...(matterId ? { matterId } : {}),
    },
  });
  const cd = data(counter);
  const authorities = Array.isArray(cd['authorities'])
    ? (cd['authorities'] as Record<string, unknown>[])
    : [];
  observations['counterAuthorityCount'] = authorities.length;
  observations['counterTop'] = authorities[0]
    ? {
        judgmentId: authorities[0]['judgmentId'],
        caseTitle: authorities[0]['caseTitle'],
        neutralCitation: authorities[0]['neutralCitation'],
        court: authorities[0]['court'],
      }
    : null;
  observations['counterExcludedCount'] = Array.isArray(cd['excluded'])
    ? (cd['excluded'] as unknown[]).length
    : 0;
  /** The abstention signal M06/M07 exist to look for. Absent = the finding. */
  observations['counterReviewRequired'] = cd['reviewRequired'] ?? null;
  observations['counterKeys'] = Object.keys(cd);

  // ── 9. MONITORING ─────────────────────────────────────────────────────────
  const alerts = data(await call('alerts', '/alerts'));
  observations['alertCount'] = Array.isArray(alerts['alerts'])
    ? (alerts['alerts'] as unknown[]).length
    : 0;
  observations['alertObservation'] =
    'ALERT_PATH_ONLY — firing one needs a corpus mutation this test refuses to make';
  const settings = await call('alert_settings', '/me/alert-settings', {
    method: 'PATCH',
    body: { savedAuthorityMoved: true },
  });
  observations['alertSettingsStatus'] = settings.status;
  observations['alertSettings'] = data(settings)['settings'] ?? null;

  // ── 10. ENTITLEMENTS — must fail closed ───────────────────────────────────
  const ent = await call('entitlements', '/me/entitlements');
  observations['entitlementStatus'] = ent.status;
  observations['capabilities'] = data(ent)['capabilities'] ?? null;

  return {
    key: fx.key,
    scenario: fx.scenario,
    ranAt: new Date().toISOString(),
    invariants,
    fixtureDrift,
    invariantsUnchecked,
    steps,
    observations,
  };
}

/**
 * One predicate, and it is the tag.
 *
 * Order matters: children before parents, or a foreign key refuses and the rows
 * survive the run — which is precisely how the 16 leaked `Test Court` rows in
 * M08 got there.
 */
async function cleanup(sql: postgres.Sql): Promise<void> {
  const like = `${FIXTURE_TAG}-%`;
  const users = await sql<{ id: string }[]>`SELECT id FROM users WHERE auth_id LIKE ${like}`;
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const matters = await sql<{ id: string }[]>`
      SELECT id FROM matters WHERE user_id = ANY(${userIds})`;
    const matterIds = matters.map((m) => m.id);
    if (matterIds.length > 0) {
      await sql`DELETE FROM matter_authorities WHERE matter_id = ANY(${matterIds})`;
      await sql`DELETE FROM matter_events WHERE matter_id = ANY(${matterIds})`;
      await sql`DELETE FROM briefings WHERE matter_id = ANY(${matterIds})`;
      await sql`DELETE FROM judgment_annotations WHERE matter_id = ANY(${matterIds})`;
    }
    await sql`DELETE FROM alerts WHERE user_id = ANY(${userIds})`;
    await sql`DELETE FROM matters WHERE user_id = ANY(${userIds})`;
    await sql`DELETE FROM activation_events WHERE user_id = ANY(${userIds})`;
  }
  await sql`DELETE FROM users WHERE auth_id LIKE ${like}`;
  await sql`DELETE FROM auth_user WHERE id LIKE ${like}`;
}

process.exitCode = await main();
