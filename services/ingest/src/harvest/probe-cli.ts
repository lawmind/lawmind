/**
 * `pnpm --filter @lawmind/ingest harvest:probe` — day one with a new account.
 *
 * **Measurement, not harvest.** `docs/HARVEST_ENGINE.md` §13. The first session
 * with a licensed account should answer four questions and pull almost nothing:
 *
 *   1. Does the account work, and what does it see?
 *   2. What sustained rate does the service actually permit?
 *   3. How many of OUR judgments can they enrich? — the overlap is the worklist
 *   4. What does one page look like, archived, so the parser can be built
 *      **offline** against it?
 *
 * The fourth is the one people skip and regret. **Iterating a parser against the
 * live service is paying for our own bugs**, at ₹50,000 a month and a rate
 * ceiling that decides the total.
 *
 * It writes a completion date and a total cost. **Commit to that many months and
 * not one more.**
 *
 * Nothing here writes to `judgments` or any product table. It fills the archive,
 * the ledger and the queue, and prints.
 */
import postgres from 'postgres';

import { projectCompletion } from './pace.ts';
import { enqueue, progress, recordFetch } from './store.ts';
import { createSupremeTodayClient } from './supremetoday.ts';

const SOURCE = 'supreme_today';

/** How many judgments the probe touches. Small on purpose — this is a sample. */
const PROBE_SIZE = Number(process.env['HARVEST_PROBE_SIZE'] ?? '20');

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('CORPUS_DATABASE_URL is not set — the worklist comes from our own corpus.');
  process.exit(2);
}

const sql = postgres(dbUrl, { ssl: dbUrl.includes('localhost') ? false : 'require', max: 3 });
const client = createSupremeTodayClient();

try {
  console.log('SUPREME TODAY — day-one probe');
  console.log('='.repeat(74));

  if (!client.configured) {
    console.log('');
    console.log('SUPREMETODAY_USERNAME / SUPREMETODAY_PASSWORD are not set.');
    console.log('The probe stops here and nothing was attempted. That is the whole design:');
    console.log('the path exists, it is tested, and it refuses honestly until an account does.');
    console.log('');
    console.log('When the account exists, set both and re-run. Also set');
    console.log('SUPREMETODAY_MAX_REQUESTS_PER_DAY from the contract — it defaults to 500,');
    console.log('which is a placeholder, not an estimate.');
    process.exit(0);
  }

  /* ------------------------------------------------------ 3 · the worklist -- */

  /**
   * **Our own corpus is the index into theirs.** `HARVEST_ENGINE.md` §11.
   *
   * Ordered by inbound citation count: the judgments other courts rely on most
   * are the ones whose editorial layer is worth the most, and if the probe is
   * cut short it will have spent its requests on the right rows.
   */
  const candidates = await sql<{ id: string; case_title: string; citation: string }[]>`
    SELECT j.id,
           j.case_title,
           coalesce(j.neutral_citation, j.reporter_citations[1]) AS citation
      FROM judgments j
      LEFT JOIN (
        SELECT cited_judgment_id, count(*)::int AS inbound
          FROM judgment_citations
         WHERE cited_judgment_id IS NOT NULL
         GROUP BY 1
      ) c ON c.cited_judgment_id = j.id
     WHERE coalesce(j.neutral_citation, j.reporter_citations[1]) IS NOT NULL
     ORDER BY coalesce(c.inbound, 0) DESC
     LIMIT ${PROBE_SIZE}
  `;

  const added = await enqueue(
    sql,
    candidates.map((c) => ({ source: SOURCE, itemKey: c.id, citation: c.citation, priority: 10 })),
  );
  console.log(`worklist    ${candidates.length} candidates, ${added} newly enqueued`);

  /* ---------------------------------------------------------- 1 · the login -- */

  const login = await client.login();
  if (!login.ok) {
    await recordFetch(sql, {
      source: SOURCE,
      url: '/api/account/login',
      outcome: login.halted ? 'refused' : 'error',
      refusalReason: login.reason,
    });
    console.log('');
    console.log(`LOGIN FAILED — ${login.reason}`);
    console.log('');
    console.log('The probe stops. It does not retry: a second attempt against a service that');
    console.log('just refused us is indistinguishable from credential stuffing in their logs,');
    console.log('and this is the only account we have.');
    process.exit(1);
  }
  console.log('login       ok');

  /* -------------------------------------------- 2 and 4 · rate and one page -- */

  let fetched = 0;
  let resolved = 0;

  for (const c of candidates) {
    const wait = client.waitMs();
    if (wait === null) {
      console.log(`\nstopped: ${client.state().halted ?? 'budget spent'}`);
      break;
    }
    await new Promise((r) => setTimeout(r, wait));

    /**
     * The citation search is the cheapest useful call and the one that answers
     * question 3. Their editorial pages are database reads; nothing here touches
     * a model-backed endpoint, which is both better citizenship and a lower
     * chance of showing up as a cost centre.
     */
    const path = `/api/search/citation?q=${encodeURIComponent(c.citation)}`;
    const started = Date.now();
    const res = await client.get(path);
    const durationMs = Date.now() - started;

    await recordFetch(sql, {
      source: SOURCE,
      url: path,
      outcome: res.ok ? 'ok' : res.halted ? 'refused' : 'error',
      httpStatus: res.ok ? res.status : undefined,
      durationMs,
      refusalReason: res.ok ? undefined : res.reason,
      body: res.ok ? res.body : undefined,
      accountLabel: 'st-primary',
      workItemKey: c.id,
    });

    if (res.ok) {
      fetched += 1;
      // A crude resolution test on purpose. The real parser is built OFFLINE
      // against these archived bodies — that is what question 4 is for.
      if (res.body.length > 500) resolved += 1;
    } else if (res.halted) {
      console.log(`\nHALTED — ${res.reason}`);
      break;
    }

    process.stdout.write(`  ${fetched}/${candidates.length} fetched\r`);
  }

  /* --------------------------------------------------------- what it means -- */

  const st = client.state();
  const p = await progress(sql, SOURCE);

  console.log('');
  console.log('');
  console.log('MEASURED');
  console.log('-'.repeat(74));
  console.log(`  requests made        ${st.requests}`);
  console.log(`  settled interval     ${Math.round(st.pace.intervalMs)} ms`);
  console.log(
    `  strain seen at       ${st.pace.ceilingSeen === null ? 'never — the ceiling was not found' : `${Math.round(st.pace.ceilingSeen)} ms`}`,
  );
  console.log(`  bodies archived      ${fetched}`);
  console.log(
    `  plausibly resolved   ${resolved} of ${fetched}` +
      (fetched > 0 ? ` (${((resolved / fetched) * 100).toFixed(0)}%)` : ''),
  );
  console.log(`  ledger rows          ${p.fetches}`);

  /**
   * The commercial output. A resolution rate from twenty judgments is a rough
   * estimate and is labelled as one — but the shape of the answer is what week
   * one is for, and a rough completion date beats no completion date.
   */
  const corpus = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM judgments
     WHERE coalesce(neutral_citation, reporter_citations[1]) IS NOT NULL`;
  const withCitations = corpus[0]?.n ?? 0;
  const estimatedTarget = fetched > 0 ? Math.round(withCitations * (resolved / fetched)) : 0;

  console.log('');
  console.log('PROJECTED — rough, from a 20-judgment sample');
  console.log('-'.repeat(74));
  console.log(`  our judgments with a citation   ${withCitations.toLocaleString('en-IN')}`);
  console.log(`  estimated resolvable by them    ${estimatedTarget.toLocaleString('en-IN')}`);

  const done = projectCompletion(estimatedTarget, st.pace);
  if (done === null) {
    console.log('  completion                      NOT POSSIBLE at this budget — renegotiate');
    console.log('                                  the ceiling or cut the target.');
  } else {
    console.log(`  completion                      ${done.days} days · ${done.months} month(s)`);
    console.log(
      `  total licence cost              ₹${(done.months * 50_000).toLocaleString('en-IN')}`,
    );
    console.log('');
    console.log('  Commit to that many months and not one more. If it exceeds ~₹3,00,000,');
    console.log('  stop after High Courts and tribunals and take the rest free from AWS');
    console.log('  Open Data and e-SCR.');
  }

  console.log('');
  console.log('NEXT: build the parser OFFLINE against the archived bodies —');
  console.log("  SELECT body FROM harvest_fetches WHERE source = 'supreme_today' LIMIT 1;");
  console.log('Never iterate a parser against the live service.');
} finally {
  await sql.end();
}
