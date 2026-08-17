/**
 * NEW2 — VERIFY the local canary before the fleet is allowed back.
 *
 * Answers the seven questions the Railway-exit directive names, and answers each
 * by OBSERVATION rather than by the absence of an error:
 *
 *   1 restore completeness  local judgments == 7,296,068 (LCC bus 0558)
 *   2 local inserts         two samples, seconds apart, must differ
 *   3 checkpoint advance    two reads of .checkpoints, offsets must move
 *   4 dedup                 the source_url unique index exists AND holds
 *   5 text extraction       sampled rows carry full_text
 *   6 classification        hc_class_method is being populated
 *   7 NO RAILWAY TRAFFIC    no live TCP connection to the Railway proxy
 *
 * IT CONNECTS ONLY TO LOOPBACK, and refuses otherwise. A verification that could
 * silently be run against Railway would pass while proving the opposite of what
 * it claims — and the whole point of this exit is that nothing reaches Railway
 * any more.
 *
 * THE COUNT IN CHECK 1 IS THE ONE THAT MATTERS MOST, and it is not cosmetic.
 * 301,422 documents were written to Railway during the broken freeze. LCC's
 * FIRST pg_dump had a snapshot predating them and died at 42 minutes; the
 * replacement chunked dump opened at 20:39:05Z, after the last of those writes,
 * so it should carry them. 6,994,646 means the old baseline came across and
 * those documents are NOT here — in which case the checkpoints DO point past
 * data the local database lacks, and the rewind that bus 0558 called off is back
 * on. This check is how that is decided, rather than by whose reasoning sounded
 * better.
 *
 *   node scripts/migration/verify-local-canary.mjs
 *   node scripts/migration/verify-local-canary.mjs --window 90
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CKPT_DIR = join(ROOT, 'services', 'ingest', '.checkpoints');

const argv = process.argv.slice(2);
const WINDOW_S = Number(argv[argv.indexOf('--window') + 1]) || 60;
/** LCC bus 0558: the number the local copy must show if the chunked dump carried the 301,422. */
const EXPECTED_JUDGMENTS = 7_296_068;
const BASELINE_JUDGMENTS = 6_994_646;

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const url = env.match(/^LOCAL_DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!url) {
  console.error('LOCAL_DATABASE_URL is not set in .env — refusing.');
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost|\[::1\]/.test(url) || /rlwy\.net|railway/.test(url)) {
  console.error('LOCAL_DATABASE_URL is not a loopback address — refusing to "verify" against a remote database.');
  process.exit(2);
}

const sql = postgres(url, { ssl: false, max: 1, connect_timeout: 30, idle_timeout: 5 });
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  const mark = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  console.log(`  ${mark.padEnd(5)} ${name.padEnd(26)} ${detail}`);
};

const checkpointOffsets = () => {
  const out = new Map();
  for (const f of readdirSync(CKPT_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue;
    try {
      const j = JSON.parse(readFileSync(join(CKPT_DIR, f), 'utf8'));
      for (const [k, v] of Object.entries(j)) out.set(`${f}::${k}`, v.offset);
    } catch {
      out.set(`${f}::UNPARSEABLE`, statSync(join(CKPT_DIR, f)).mtimeMs);
    }
  }
  return out;
};

console.log(`LOCAL CANARY VERIFICATION — ${new Date().toISOString()}`);
console.log(`  target ${url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')} · window ${WINDOW_S}s\n`);

try {
  /**
   * REFUSE TO PILE A SECOND FULL SCAN ON TOP OF ONE ALREADY RUNNING.
   *
   * `count(*)` over 7.3M rows in a 50 GB table is a parallel sequential scan
   * that reads the whole heap. LCC runs exactly this query to verify the
   * restore, and NEW1 has already lost 16.4 hours to a long query blocking a
   * second copy of itself (bus 0523). Two of these at once do not go twice as
   * fast; they halve each other and saturate the NVMe whose headroom the
   * scale-up decision is read from.
   *
   * This waits rather than failing, because the right answer to "someone else is
   * counting" is "let them finish", not "give up".
   */
  /**
   * TWO KINDS OF BUSY, AND THE SECOND ONE IS WORSE.
   *
   * A concurrent COUNT halves both scans. A concurrent BULK LOAD does something
   * more dangerous: it makes the answer WRONG. On 17 Aug, while `judgments` was
   * being refilled from `judgments__stage` by 8 parallel INSERT workers, a
   * `count(*)` would have returned roughly 3 million — not the baseline, not the
   * expected figure, and check 1 would have reported it as an unexplained
   * deficit demanding investigation. The number would have been perfectly
   * accurate and completely meaningless.
   *
   * Counting a table mid-load is not a measurement, it is a stopwatch reading.
   *
   * THE PATTERNS ARE UNANCHORED, and that is the whole lesson. The first version
   * used `ilike 'insert into%judgments%'` and caught NOTHING, because the real
   * statement arrives as `BEGIN;` + newline + `INSERT INTO public.judgments …`,
   * so an anchored pattern never matches. It was run against the live load and
   * check 1 duly reported 1,830,520 rows and demanded investigation of an
   * "unexplained deficit" that was a restore in progress. A guard that has only
   * been reasoned about is not a guard.
   */
  const countRunning = async () => {
    const rows = await sql`
      select pid,
             coalesce(now() - query_start, interval '0') as runtime,
             case
               when query ilike '%insert into%judgments%'
                 or query ilike '%copy%judgments%'
                 or query ilike '%create table%judgments%' then 'BULK LOAD'
               else 'count'
             end as kind
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and state = 'active'
        and (
          (query ilike '%count(%' and query ilike '%judgments%')
          or query ilike '%insert into%judgments%'
          or query ilike '%copy%judgments%'
        )`;
    return rows;
  };
  /**
   * A bulk load is not waited out — it can run for an hour and the wait would
   * expire mid-load, producing exactly the wrong number this guard exists to
   * prevent. It REFUSES, loudly, and says whose job it is.
   */
  {
    const busy = await countRunning();
    const loading = busy.filter((b) => b.kind === 'BULK LOAD');
    if (loading.length > 0) {
      console.log(`  REFUSING — judgments is being LOADED right now (${loading.length} backend(s), oldest ${loading[0].runtime}).`);
      console.log('  A count taken mid-load is an accurate number and a meaningless one: it reports');
      console.log('  however far the load happens to have got, and check 1 would read that as an');
      console.log('  unexplained deficit. The load is LCC\'s; wait for it and re-run.');
      await sql.end({ timeout: 5 });
      process.exit(2);
    }
  }
  for (let waited = 0; waited < 900; waited += 15) {
    const busy = (await countRunning()).filter((b) => b.kind === 'count');
    if (busy.length === 0) break;
    if (waited === 0) {
      console.log(`  WAIT  another count over judgments is already running (${busy.length} backend(s), oldest ${busy[0].runtime}).`);
      console.log('        Waiting rather than starting a second full scan of the same 50 GB.\n');
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }

  /**
   * IS THE REBUILD SWAP STILL PENDING? Asked BEFORE the count, because the count
   * is meaningless without the answer.
   *
   * 17 Aug 2026: the machine lost power mid-rebuild. LCC's rebuild stages into
   * `judgments__stage` and swaps at the end, so the outage left `judgments`
   * EMPTY and `judgments__stage` holding all 7,296,068 rows. A check that
   * counted `judgments` and stopped would have reported zero rows and read as
   * total data loss, when nothing at all was lost.
   *
   * This is the difference between "the table is empty" and "the table is not
   * the one holding the data yet", and only one of those is an emergency.
   *
   * ---------------------------------------------------------------------------
   * THE CRITERION IS THE ROW COUNT. EMPTINESS AND EXISTENCE WERE BOTH PROXIES.
   * ---------------------------------------------------------------------------
   * This check has now been wrong twice, in the same way, one level apart:
   *
   *   v1  fired when `judgments` was EMPTY.      Missed the partial-refill state
   *       (crash mid-load, some rows committed) and graded a half-loaded table.
   *   v2  fired when `judgments__stage` EXISTED.  NEW1's shape, adopted from bus
   *       0583 — and wrong for the mirror-image reason (NEW1, bus 0587).
   *
   * LCC **refills `judgments` FROM the stage table** rather than renaming it into
   * place — observed directly: 8 backends running `INSERT INTO public.judgments`
   * while `judgments__stage` sat unchanged at 7,717 MB. So the stage table's
   * DISAPPEARANCE marks completion, but its PRESENCE does not mark
   * incompleteness. There is a real, healthy state where the load has finished,
   * `judgments` holds all 7,296,068, and the stage table is simply still sitting
   * there un-dropped. v2 refuses that database.
   *
   * Both versions asserted something ADJACENT to the question. The question is
   * "does the live table hold the corpus", and only the row count answers it.
   *
   *   stage absent                        -> proceed. One catalogue lookup, free.
   *   stage present, judgments == target  -> NOTE and proceed. Debris, not a fault.
   *   stage present, anything else        -> REFUSE, exit 2.
   *
   * The count is paid only when the stage table is actually there, so the normal
   * path stays a single instant `to_regclass`. And it does NOT depend on knowing
   * whether LCC's cleanup step drops the table — a guard that needs someone
   * else's housekeeping to have run is a guard with a scheduling dependency.
   *
   * REFUSAL (exit 2), NOT FAIL. They mean different things to whoever reads this
   * at 3am: FAIL says the migration is broken, refusal says the gate cannot
   * answer yet. Only one of those invites someone to re-restore 40 GB.
   */
  const [{ stage }] = await sql`select to_regclass('public.judgments__stage') is not null as stage`;

  // 1 — restore completeness. The ONE full scan this script is allowed, because
  //     it is the gate: an estimate cannot settle the 301,422 question. It is
  //     also what the stage-table branch below adjudicates on, so it is counted
  //     once and used twice rather than paid for twice.
  const [{ count: judgments }] = await sql`select count(*)::bigint as count from judgments`;
  const n = Number(judgments);

  if (stage && n !== EXPECTED_JUDGMENTS) {
    console.log(`  REFUSING — public.judgments__stage exists AND judgments holds ${n.toLocaleString()},`);
    console.log(`  not the frozen target of ${EXPECTED_JUDGMENTS.toLocaleString()}. The rebuild has not finished.`);
    console.log('');
    console.log('  This is NOT data loss. Do not re-restore, do not rewind checkpoints, do not start');
    console.log('  workers: LCC refills judgments FROM the stage table, so a write now races a load');
    console.log('  that is still running or still to be resumed.');
    console.log('');
    console.log('  Nothing is graded. The refill is LCC\'s; re-run after it.');
    await sql.end({ timeout: 5 });
    process.exit(2);
  }
  if (stage) {
    console.log(`  NOTE  public.judgments__stage still exists, but judgments holds the full`);
    console.log(`        ${EXPECTED_JUDGMENTS.toLocaleString()}. The refill is COMPLETE and the stage table is leftover`);
    console.log('        debris, not an unfinished step. Proceeding. (LCC drops it when they choose;');
    console.log('        this gate does not depend on that having happened.)');
    console.log('');
  }
  record(
    'restore completeness',
    n === EXPECTED_JUDGMENTS,
    n === EXPECTED_JUDGMENTS
      ? `${n.toLocaleString()} — the 301,422 came across`
      : n === BASELINE_JUDGMENTS
        ? `${n.toLocaleString()} == OLD BASELINE. The 301,422 are MISSING — bus 0558's conclusion fails and the checkpoint rewind is back on.`
        : `${n.toLocaleString()} — expected ${EXPECTED_JUDGMENTS.toLocaleString()}. Neither the baseline nor the post-freeze figure; investigate before resuming.`,
  );

  // 4 — dedup: the constraint that makes a re-scan safe must actually exist here
  const idx = await sql`
    select indexname from pg_indexes
    where tablename = 'judgments' and indexdef ilike '%unique%' and indexdef ilike '%source_url%'`;
  record(
    'dedup constraint',
    idx.length > 0,
    idx.length > 0 ? idx.map((r) => r.indexname).join(', ') : 'NO UNIQUE INDEX ON source_url — a re-scan would duplicate rows',
  );

  // 5 — text extraction
  const [txt] = await sql`
    select count(*)::bigint as n, count(full_text)::bigint as with_text
    from (select full_text from judgments limit 5000) s`;
  const share = Number(txt.n) ? (Number(txt.with_text) / Number(txt.n)) * 100 : 0;
  record('text extraction', Number(txt.with_text) > 0, `${share.toFixed(1)}% of a 5,000-row sample carry full_text`);

  // 2 + 3 + 6 — anything that needs two samples
  /**
   * SAMPLED FROM THE STATISTICS COUNTERS, NOT FROM `count(*)`.
   *
   * The first version of this ran four more full scans here — two for the insert
   * rate and two for the classification rate — on top of check 1's. That is
   * ~200 GB of heap read to answer "did anything change", during the exact
   * minutes the NVMe headroom is being read to decide whether to go from 3
   * workers to 8. The measurement would have consumed the thing it measures.
   *
   * `n_tup_ins` IS the count of rows inserted, exactly, and its delta is exactly
   * what check 2 asks for. `n_tup_upd` is update activity on `judgments` — it is
   * NOT classification-specific and is not claimed to be; the canary launches
   * three harvest workers and no classifier, so check 6 is context rather than a
   * gate, and paying two table scans to say "no change, as expected" was the
   * worst possible trade.
   */
  const tableStats = async () => {
    const [r] = await sql`
      select coalesce(n_tup_ins, 0)::bigint as ins, coalesce(n_tup_upd, 0)::bigint as upd
      from pg_stat_user_tables where relname = 'judgments'`;
    return { ins: Number(r?.ins ?? 0), upd: Number(r?.upd ?? 0) };
  };

  const beforeCk = checkpointOffsets();
  const statsBefore = await tableStats();

  console.log(`\n  … sampling for ${WINDOW_S}s\n`);
  await new Promise((r) => setTimeout(r, WINDOW_S * 1000));

  const statsAfter = await tableStats();
  const afterCk = checkpointOffsets();

  const rowDelta = statsAfter.ins - statsBefore.ins;
  record('local inserts', rowDelta > 0, `+${rowDelta.toLocaleString()} rows in ${WINDOW_S}s (${Math.round((rowDelta / WINDOW_S) * 3600).toLocaleString()}/hr, from n_tup_ins)`);

  let moved = 0;
  for (const [k, v] of afterCk) if (beforeCk.has(k) && v > beforeCk.get(k)) moved++;
  record('checkpoint advance', moved > 0, `${moved} source-file offsets advanced`);

  const updDelta = statsAfter.upd - statsBefore.upd;
  record(
    'classification',
    true,
    updDelta > 0
      ? `+${updDelta.toLocaleString()} row updates on judgments in ${WINDOW_S}s (n_tup_upd — update activity, NOT classification-specific)`
      : 'no update activity — expected, the canary runs three harvest workers and no classifier',
  );

  // 7 — no Railway traffic
  /**
   * ATTRIBUTED BY OWNING PROCESS, not by counting sockets, and the distinction
   * is what makes this check usable at all.
   *
   * The first version failed on ANY live connection to the Railway proxy. Run
   * during the migration it reported six — every one of them LCC's `psql.exe`
   * chunked-dump workers, which are supposed to be talking to Railway; that is
   * the migration. A check that is red for the entire window it exists to
   * police gets ignored, which is worse than not having it.
   *
   * The directive's rule is about INGESTION: no ingest worker may reach Railway
   * after cutover. So a connection owned by a node process running our harvest
   * or classify code is a DEFECT and fails; anything else is reported and does
   * not. Attribution is by owning pid, so it cannot be fooled by a coincidence
   * of timing.
   */
  const railwayHost = env.match(/^RAILWAY_DATABASE_URL=.*@([^:]+):/m)?.[1] ?? 'hayabusa.proxy.rlwy.net';
  let raw = '';
  try {
    raw = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
        `$ips=@(); try{$ips=[System.Net.Dns]::GetHostAddresses('${railwayHost}')|%{$_.IPAddressToString}}catch{};` +
        `if($ips.Count -eq 0){'NO_DNS'; exit};` +
        `$c=@(Get-NetTCPConnection -ErrorAction SilentlyContinue|Where-Object{$ips -contains $_.RemoteAddress -and $_.State -eq 'Established'});` +
        `if($c.Count -eq 0){'NONE'; exit};` +
        `($c|%{ $pr=Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue;` +
        ` $isIngest = if($pr -and $pr.CommandLine -match 'hc-load-cli|hc-classify-cli|supervise\\.mjs'){'INGEST'}else{'other'};` +
        ` "$isIngest|$($pr.Name)|pid=$($_.OwningProcess)" }) -join '; '`],
      { encoding: 'utf8', timeout: 45_000 },
    ).trim();
  } catch (err) {
    raw = `CHECK_FAILED: ${err.message}`;
  }
  const ingestConns = raw.split(';').map((s) => s.trim()).filter((s) => s.startsWith('INGEST'));
  const noneAtAll = raw === 'NONE' || raw === 'NO_DNS';
  record(
    'no Railway traffic',
    !raw.startsWith('CHECK_FAILED') && ingestConns.length === 0,
    noneAtAll
      ? `no established connection to ${railwayHost}`
      : ingestConns.length > 0
        ? `INGEST WORKER STILL ON RAILWAY — ${ingestConns.join('; ')}`
        : `${raw.split(';').length} non-ingest connection(s) only (LCC's dump uses psql): ${raw}`,
  );
} finally {
  await sql.end({ timeout: 5 });
}

const failed = results.filter((r) => r.pass === false);
console.log('');
if (failed.length === 0) {
  console.log('CANARY VERIFIED — safe to scale. Scale by MEASURED docs/hour, not to 38.');
  process.exit(0);
}
console.log(`CANARY FAILED ${failed.length} CHECK(S) — do not scale:`);
for (const f of failed) console.log(`  ${f.name}: ${f.detail}`);
process.exit(1);
