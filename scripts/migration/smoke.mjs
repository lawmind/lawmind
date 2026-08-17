#!/usr/bin/env node
/**
 * STAGE F / H — does the restored database actually WORK?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ROW COUNTS ARE NOT ENOUGH, WHICH IS THE WHOLE POINT OF THIS FILE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `compare.mjs` proves the target holds the same rows, columns, indexes and
 * constraints as the source. That is necessary and it is not sufficient. A
 * database can pass every structural check and still fail to serve the product:
 *
 * - a **GIN full-text index** can exist and be empty-ish if the restore rebuilt
 *   it against a different text search configuration
 * - an **HNSW vector index** can exist and never be chosen by the planner,
 *   turning every ANN query into a sequential scan over 599k vectors
 * - **ICU vs libc collation** — the one thing this cross-platform move
 *   genuinely changes — is invisible to a row count and shows up as ordering
 * - a restored database has **no statistics at all** until ANALYZE, so the
 *   planner guesses; the first person to benchmark it measures the missing
 *   statistics rather than the migration
 *
 * The founder directive says to run real application/retrieval smoke tests
 * against LOCAL. These are those tests, and each one asserts something a
 * structural comparison cannot see.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CHECKS PLANS, NOT JUST RESULTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Several checks read `EXPLAIN` output and assert that the *index* was used.
 * A query that returns the right answer by sequentially scanning 28 million
 * paragraphs is a correct answer and a broken database — it will pass a
 * functional test and miss Gate S1's 3-second budget in production. Correctness
 * and the plan are different questions and both are asked here.
 *
 *   node scripts/migration/smoke.mjs --source local
 *   node scripts/migration/smoke.mjs --source railway   # to compare behaviour
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './manifest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readEnvFile() {
  const out = {};
  const f = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const results = [];
function record(name, pass, detail, ms) {
  results.push({ name, pass, detail, ms });
  const tag = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO';
  console.log(`  ${tag.padEnd(4)} ${name.padEnd(46)} ${ms != null ? String(ms).padStart(6) + 'ms' : '       '}  ${detail}`);
}

async function timed(fn) {
  const t = Date.now();
  const v = await fn();
  return [v, Date.now() - t];
}

async function main() {
  const argv = process.argv.slice(2);
  const source = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : 'local';
  const env = { ...readEnvFile(), ...process.env };
  const url = source === 'local' ? env.LOCAL_DATABASE_URL : env.DATABASE_URL;
  if (!url) {
    console.error(`No url for --source ${source}`);
    process.exit(2);
  }

  const sql = await openDb(url, 3);
  console.log(`smoke: ${source}`);
  console.log('');

  try {
    // ── 1. Extensions actually load and compute, not merely exist in a catalog.
    {
      const [r, ms] = await timed(() => sql`SELECT '[1,2,3]'::vector <-> '[3,2,1]'::vector AS d`);
      record('pgvector operator computes', Number(r[0].d) > 0, `L2 distance = ${Number(r[0].d).toFixed(4)}`, ms);
    }
    {
      const [r, ms] = await timed(() => sql`SELECT similarity('Kesavananda', 'Kesavanand') AS s`);
      record('pg_trgm similarity computes', Number(r[0].s) > 0.5, `similarity = ${Number(r[0].s).toFixed(3)}`, ms);
    }

    // ── 2. The corpus is present and its shape is right.
    //
    // ESTIMATES, deliberately, and this was changed after the first version made
    // this a `count(*)`. An exact count of `judgments` is a parallel sequential
    // scan of 7M rows and of `judgment_paragraphs` 28M — minutes each, and while
    // the migration dump is running it is minutes stolen from the dump.
    //
    // It was also the wrong tool. This is a smoke test: it asks "is there a
    // corpus here and does it serve queries?". "Are the counts EQUAL to the
    // source?" is a different question, it is the cutover gate, and
    // `compare.mjs --exact` is what answers it. Using a slow exact count here
    // would neither speed that up nor replace it.
    {
      const [r, ms] = await timed(
        () => sql`SELECT relname, reltuples::bigint AS n FROM pg_class
                  WHERE relname IN ('judgments','judgment_chunks','judgment_citations','judgment_paragraphs')`,
      );
      const m = Object.fromEntries(r.map((x) => [x.relname, Number(x.n)]));
      record(
        'corpus is populated (estimates)',
        (m.judgments ?? 0) > 1_000_000,
        `~judgments ${m.judgments} · ~paragraphs ${m.judgment_paragraphs} · ~chunks ${m.judgment_chunks} · ~citations ${m.judgment_citations}`,
        ms,
      );
    }

    // ── 3. Full-text search — the 14 GB GIN index, the largest object in the DB.
    //
    // THE PREDICATE MUST MATCH THE INDEX, and the first version of this did not.
    // It queried `to_tsvector('english', full_text) @@ ...` and reported
    // "SEQ SCAN — the 14 GB index is not being used" against RAILWAY, a database
    // known to serve this query 16,109 times. The database was right and the
    // test was wrong:
    //
    //   CREATE INDEX judgments_full_text_idx ON judgments USING gin (full_text_tsv)
    //
    // The index is on a STORED tsvector COLUMN, not on an expression. A predicate
    // over `to_tsvector(...)` is a different expression and can never match it,
    // so it seq-scans by definition.
    //
    // Running this against the known-good source BEFORE trusting it on the new
    // one is what caught it. A test that has only ever run against the database
    // it is judging cannot tell "the target is broken" from "the test is wrong".
    {
      const [r, ms] = await timed(
        () => sql`SELECT id, case_title FROM judgments
                  WHERE full_text_tsv @@ plainto_tsquery('english', 'bail application')
                  LIMIT 5`,
      );
      record('full-text search returns rows', r.length > 0, `${r.length} hit(s)`, ms);
    }
    {
      // The plan matters more than the rows here.
      const plan = await sql.unsafe(
        `EXPLAIN (FORMAT JSON)
         SELECT id FROM judgments
         WHERE full_text_tsv @@ plainto_tsquery('english', 'constitutional validity')
         LIMIT 5`,
      );
      const text = JSON.stringify(plan);
      const usesIndex = /judgments_full_text_idx/.test(text);
      const [rpc] = await sql`SELECT current_setting('random_page_cost') AS v`;
      const cost = (text.match(/"Total Cost":\s*([0-9.]+)/) ?? [])[1];

      // KNOWN TO FAIL ON RAILWAY, and that is a finding about Railway rather
      // than about this test. Measured there:
      //
      //   seq scan          cost 1,060,274
      //   bitmap GIN scan   cost 2,140,301   (forced with enable_seqscan=off)
      //
      // The index is valid, ready and live — checked — and it has 16,109
      // lifetime scans. The planner simply costs a GIN scan of a 15.5 GB,
      // 1.89M-page index above a parallel sequential scan of the table, and it
      // does so even for a term it estimates at ONE matching row.
      //
      // `random_page_cost` is the lever, and it is the one real difference
      // between the two clusters here: Railway runs the 4.0 default, which
      // encodes a spinning disk. The local cluster is on NVMe and set to 1.1 —
      // a decision made in lawmind.conf for its own reasons, before this was
      // noticed. So the local database may well choose the index where Railway
      // will not. That is a PREDICTION to check after the restore, not a claim.
      record(
        'full-text query uses the GIN index',
        usesIndex,
        usesIndex
          ? `index scan chosen (random_page_cost=${rpc.v}, cost≈${cost})`
          : `SEQ SCAN — 15.5 GB index not chosen (random_page_cost=${rpc.v}, cost≈${cost}). ` +
            `Known pre-existing on Railway; see the comment here before treating it as a migration defect`,
      );
    }

    // ── 4. Vector ANN — the HNSW index the retrieval path depends on.
    {
      const [dim] = await sql`SELECT vector_dims(embedding) AS d FROM judgment_chunks
                              WHERE embedding IS NOT NULL LIMIT 1`;
      if (!dim) {
        record('vector column populated', false, 'no non-null embedding found');
      } else {
        record('vector column populated', true, `${dim.d} dimensions`);
        const [probe] = await sql`SELECT embedding::text AS e FROM judgment_chunks
                                  WHERE embedding IS NOT NULL LIMIT 1`;
        const [r, ms] = await timed(
          () => sql.unsafe(
            `SELECT judgment_id FROM judgment_chunks
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> '${probe.e}'::vector LIMIT 10`,
          ),
        );
        record('ANN search returns neighbours', r.length === 10, `${r.length} neighbour(s)`, ms);

        const plan = await sql.unsafe(
          `EXPLAIN (FORMAT JSON)
           SELECT judgment_id FROM judgment_chunks
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> '${probe.e}'::vector LIMIT 10`,
        );
        const text = JSON.stringify(plan);
        const usesHnsw = /hnsw/i.test(text) || (/Index Scan/.test(text) && !/Seq Scan/.test(text));
        record(
          'ANN query uses the HNSW index',
          usesHnsw,
          usesHnsw ? 'index scan chosen' : 'SEQ SCAN over 599k vectors — HNSW not chosen',
        );
      }
    }

    // ── 5. The paragraph hot path. STORAGE_AUDIT.md §2b: this exact query shape
    //      runs unconditionally in every retrieval mode, inside a 3s budget.
    {
      const ids = await sql`SELECT judgment_id FROM judgment_paragraphs LIMIT 20`;
      const idList = ids.map((r) => r.judgment_id);
      const [r, ms] = await timed(
        () => sql`SELECT DISTINCT ON (judgment_id)
                    judgment_id, paragraph_text, paragraph_number, char_offset, char_length
                  FROM judgment_paragraphs
                  WHERE judgment_id = ANY(${idList})
                  ORDER BY judgment_id,
                    ts_rank(to_tsvector('english', paragraph_text),
                            plainto_tsquery('english', 'delay in filing')) DESC`,
      );
      record('fillParagraphFallback shape works', r.length > 0, `${r.length} paragraph(s)`, ms);
    }

    // ── 6. Exact-span reconstruction. Two earlier offset bugs were invisible to
    //      every unit test, and STORAGE_AUDIT.md records that the repo's own
    //      instrument caught what an ad-hoc query got wrong. Offsets surviving a
    //      migration is not something to assume.
    {
      // The sample is taken in a subquery FIRST, then joined. Writing this as
      // `SELECT count(*) ... FROM p JOIN j ... LIMIT 1` — which is what it said
      // at first — does not sample anything: LIMIT applies AFTER aggregation, so
      // it is a full join of 28M paragraphs against 7M judgments, detoasting
      // full_text for every row. That is the same mistake LEGAL_OBJECT_PROGRAM.md
      // §3 records, where a predicate on `length(full_text)` detoasted the column
      // for every row it touched and returned nothing in ten minutes.
      const [r, ms] = await timed(
        () => sql`WITH sample AS (
                    SELECT judgment_id, paragraph_text, char_offset, char_length
                    FROM judgment_paragraphs
                    WHERE char_offset IS NOT NULL
                    LIMIT 500
                  )
                  SELECT count(*) FILTER (WHERE s.paragraph_text =
                           substr(j.full_text, s.char_offset + 1, s.char_length)) AS ok,
                         count(*) AS total
                  FROM sample s
                  JOIN judgments j ON j.id = s.judgment_id
                  WHERE j.full_text IS NOT NULL`,
      );
      const ok = Number(r[0].ok);
      const total = Number(r[0].total);
      const pct = total ? (ok / total) * 100 : 0;
      // 99.98% was the pre-migration figure on a 5,620-row sample. Anything near
      // it is the corpus behaving as it did; a collapse means text or offsets
      // did not survive.
      record('paragraph offsets reconstruct text', pct > 99, `${ok}/${total} = ${pct.toFixed(2)}%`, ms);
    }

    // ── 7. The three citation fields. CLAUDE.md §6: three independent fields,
    //      never one enum, and a judgment can be verified AND overruled.
    {
      const [r, ms] = await timed(
        // THE COLUMNS ARE WHERE THE SCHEMA SAYS, NOT WHERE THEY SOUND LIKE THEY
        // SHOULD BE. This first read `judgment_citations.verification_state` and
        // failed with `column "verification_state" does not exist`, because the
        // three-field model is split across tables that do different jobs:
        //
        //   verification_cache   verification_state + verified_by_source
        //   citation_checks      verification_state + verified_by_source, per check
        //   judgments            overruled_status  <- CLAUDE.md says so explicitly
        //   judgment_citations   the corpus citation GRAPH — no verification state
        //
        // That split is the point of the model rather than an accident of it: a
        // judgment can be verified AND overruled because they are different
        // questions answered by different sources. Checked against
        // manifest-railway-stage-a.json rather than recalled.
        //
        // Bounded counts: this asks "did the model survive the migration", not
        // "how many of each" — exact figures are compare.mjs's job.
        () => sql`SELECT
            (SELECT count(DISTINCT verification_state) FROM verification_cache)  AS vc_states,
            (SELECT count(DISTINCT verified_by_source) FROM verification_cache)  AS vc_sources,
            (SELECT count(*) FROM verification_cache)                            AS vc_rows,
            (SELECT count(*) FROM citation_checks)                               AS checks,
            (SELECT count(*) FROM judgments WHERE overruled_status <> 'none')    AS overruled,
            (SELECT count(*) FROM (SELECT 1 FROM judgment_citations
               WHERE cited_judgment_id IS NOT NULL LIMIT 200000) t)              AS resolved_sample`,
      );
      record(
        'citation state fields intact',
        Number(r[0].resolved_sample) > 0 && Number(r[0].overruled) > 0,
        `resolved edges (sampled) ${r[0].resolved_sample} · overruled judgments ${r[0].overruled} · ` +
          `verification_cache ${r[0].vc_rows} rows / ${r[0].vc_states} state(s) / ${r[0].vc_sources} source(s) · ` +
          `citation_checks ${r[0].checks}`,
        ms,
      );
    }

    // ── 8. Collation. The one thing this cross-platform move genuinely changes.
    //      Not a pass/fail — a report, because ICU en-US and libc en_US.utf8 are
    //      ALLOWED to order differently and the point is to see how.
    {
      const [r] = await sql`SELECT datcollate, datlocprovider,
                                   coalesce(datlocale, '(none)') AS datlocale
                            FROM pg_database WHERE datname = current_database()`;
      const ord = await sql`SELECT x FROM (VALUES ('apple'),('Apple'),('banana'),('Banana'),('ápple'))
                            AS t(x) ORDER BY x`;
      record(
        'collation provider',
        null,
        `provider=${r.datlocprovider} locale=${r.datlocale} · sort: ${ord.map((o) => o.x).join(' ')}`,
      );
    }

    // ── 9. Statistics exist. A restored database has none until ANALYZE, and
    //      every plan above is meaningless if the planner was guessing.
    {
      const [r] = await sql`SELECT count(*) AS n FROM pg_stats WHERE schemaname = 'public'`;
      record('planner statistics present', Number(r.n) > 100, `${r.n} column stats — ANALYZE has run`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const fails = results.filter((r) => r.pass === false);
  console.log('');
  console.log(`smoke: ${results.filter((r) => r.pass === true).length} passed · ${fails.length} failed · ${results.filter((r) => r.pass === null).length} informational`);

  const out = path.join(REPO_ROOT, 'docs', 'ops', 'migration', `smoke-${source}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ source, at: new Date().toISOString(), results }, null, 2));
  console.log(`smoke: wrote ${out}`);

  if (fails.length) {
    console.log('');
    console.log('VERDICT: the database holds data but does NOT serve it correctly. Do not cut over.');
    process.exit(1);
  }
  console.log('VERDICT: retrieval paths work against this database.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
