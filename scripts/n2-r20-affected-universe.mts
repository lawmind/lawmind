/**
 * NEW2 — R20 §5/§7. THE AFFECTED-INPUT UNIVERSE FOR THE **SHARED** EXTRACTOR,
 * FROZEN, THEN EVALUATED OLD-vs-NEW.
 *
 * R18 corrected the own-citation copy of the neutral-citation regex in
 * `hc-load.ts` and deliberately left the SHARED copy in `citations.ts` alone,
 * because that copy writes `judgment_citations.normalised_citation` — the edge
 * key space — while `CITATION_BULK_APPLY = HOLD`. LCC R17 then proved the same
 * defect is live on every API citation-input path. This round corrects the
 * shared copy for FUTURE extraction only and measures what that changes.
 *
 * THE PREFILTER, AND WHY IT IS A SUPERSET RATHER THAN A SAMPLE
 * ------------------------------------------------------------
 * The boundary move can change the extractor's answer on a text ONLY where the
 * text contains `<digit>-DB` or `<digit>-FB` followed immediately by a word
 * character. Under the OLD rule that occurrence matched the UNSUFFIXED form, so
 * the edge pass wrote an UNSUFFIXED neutral row for that document. Therefore
 *
 *     { documents whose shared-extractor output moves }
 *         ⊆ { documents holding at least one unsuffixed neutral edge row }
 *
 * for every document the edge pass has already read — which is every document
 * in the corpus: `judgment_citations` carries a `normalised_citation = ''`
 * sentinel for a document that yielded nothing, and 18,759,868 distinct
 * `citing_judgment_id` values carry a row against 18,752,608 estimated
 * `judgments`. Presence is complete, so the prefilter is a corpus-wide superset
 * and not a sample of one.
 *
 * A full-text scan of all 18.7M rows (151 GB) is the alternative and it is not
 * resource-safe beside NEW1's coarse walk on the same box. The prefilter is
 * 1,148,519 documents — 16x smaller — and it is derived, not guessed.
 *
 * Read-only. No writes, no migration, no network.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r20');

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
/** The id list is 1.15M uuids — evidence by hash in git, by file on disk. */
const IDS = arg('ids', join(OUTDIR, '.affected-universe.txt'));
const CKPT = join(OUTDIR, 'affected-universe-checkpoint.json');
const HITS = join(OUTDIR, 'affected-hits.jsonl');
const CONTROL = join(OUTDIR, 'negative-control.jsonl');
const BATCH = Number(arg('batch', '2000'));
const PHASE = arg('phase', 'all');
const CONTROL_N = Number(arg('control', '20000'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** The rule at HEAD 90547174 — the boundary closes the OPTIONAL SUFFIX. */
const OLD = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
/** The correction — the boundary closes the NUMBER, the suffix follows it. */
const NEW = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;
const all = (re: RegExp, s: string): string[] =>
  [...s.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]);

/**
 * SQL-side necessary condition. A word character after a real suffix is the
 * ONLY way the two rules can disagree, so anything failing this cannot move.
 * Kept in Postgres so 1.15M full texts are read but never shipped.
 */
const PRECONDITION = '[0-9]-(DB|FB)[0-9A-Za-z_]';
const NEUTRAL_UNSUFFIXED = '^[0-9]{4}:[A-Z]{2,10}(-[A-Z]{1,3})?:[0-9]{1,6}$';

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

type Counts = Record<string, number>;
const bump = (m: Counts, k: string, by = 1): void => {
  m[k] = (m[k] ?? 0) + by;
};

/**
 * Classify one moved token against the token grammar, not against a winner.
 *
 * The only shape the correction is aimed at is `X` -> `X-DB`/`X-FB` where the
 * suffix was already printed and glued. Anything else is a surprise and is
 * named as one rather than folded into the expected class.
 */
function classify(oldTok: string, newTok: string, tail: string): string {
  const suffix = /-(DB|FB)$/.exec(newTok);
  if (!suffix) return 'AMBIGUOUS_NEW_IS_NOT_A_SUFFIXED_FORM';
  if (`${oldTok}-${suffix[1]}` !== newTok) return 'AMBIGUOUS_NEW_IS_NOT_OLD_PLUS_SUFFIX';
  /* A longer real suffix hiding in the glue tail would make the greedy take the
   * wrong token. R18 measured this as 0 of 138 on its own population; it is
   * re-measured here rather than assumed. */
  if (/^[A-Z]{1,3}(?![a-z])/.test(tail)) return 'AMBIGUOUS_TAIL_COULD_BE_A_LONGER_SUFFIX';
  return 'EXPECTED_BUG_CLOSURE';
}

try {
  mkdirSync(OUTDIR, { recursive: true });

  // ---- PHASE 1. Freeze the universe. ---------------------------------------
  if ((PHASE === 'all' || PHASE === 'freeze') && !existsSync(IDS)) {
    const t0 = Date.now();
    const rows = await sql.unsafe(
      `select distinct citing_judgment_id::text as id from judgment_citations
       where normalised_citation ~ '${NEUTRAL_UNSUFFIXED}' order by 1`,
    );
    const frozen = (rows as { id: string }[]).map((r) => r.id);
    writeFileSync(IDS, `${frozen.join('\n')}\n`);
    console.log(`[freeze] ${frozen.length} ids in ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  const ids = readFileSync(IDS, 'utf8').split('\n').filter(Boolean);
  const universeHash = createHash('sha256').update(ids.join('\n')).digest('hex');

  // ---- PHASE 2. Evaluate it exhaustively. ----------------------------------
  if (PHASE === 'all' || PHASE === 'evaluate') {
    const ck: { at: number; counts: Counts } = existsSync(CKPT)
      ? JSON.parse(readFileSync(CKPT, 'utf8'))
      : { at: 0, counts: {} };
    if (ck.at === 0) writeFileSync(HITS, '');
    const t0 = Date.now();
    for (let i = ck.at; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const rows = await sql.unsafe(
        `select id::text as id, court, neutral_citation, full_text from judgments
         where id = any($1::uuid[]) and full_text ~ '${PRECONDITION}'`,
        [slice as unknown as string],
      );
      bump(ck.counts, 'DOCS_WALKED', slice.length);
      bump(ck.counts, 'PRECONDITION_MATCHED', rows.length);
      type Row = { id: string; court: string; neutral_citation: string | null; full_text: string };
      for (const r of rows as Row[]) {
        const oldOut = all(OLD, r.full_text);
        const newOut = all(NEW, r.full_text);
        if (oldOut.length !== newOut.length) {
          bump(ck.counts, 'ARITY_CHANGED');
          appendFileSync(
            HITS,
            `${JSON.stringify({ id: r.id, court: r.court, klass: 'ARITY_CHANGED', oldCount: oldOut.length, newCount: newOut.length })}\n`,
          );
          continue;
        }
        let moved = 0;
        for (let k = 0; k < oldOut.length; k += 1) {
          if (oldOut[k] === newOut[k]) continue;
          moved += 1;
          const at = r.full_text.indexOf(newOut[k]!);
          const tail = at < 0 ? '' : r.full_text.slice(at + newOut[k]!.length, at + newOut[k]!.length + 24);
          const klass = classify(oldOut[k]!, newOut[k]!, tail);
          bump(ck.counts, klass);
          appendFileSync(
            HITS,
            `${JSON.stringify({
              id: r.id,
              court: r.court,
              storedNeutralCitation: r.neutral_citation,
              old: oldOut[k],
              new: newOut[k],
              tail,
              klass,
            })}\n`,
          );
        }
        if (moved > 0) bump(ck.counts, 'DOCS_WITH_A_MOVED_TOKEN');
      }
      ck.at = i + slice.length;
      writeFileSync(
        CKPT,
        JSON.stringify(
          { ...ck, universeHash, universeSize: ids.length, at: ck.at, updatedAt: new Date().toISOString() },
          null,
          1,
        ),
      );
      if ((i / BATCH) % 25 === 0) {
        console.log(`[eval] ${ck.at}/${ids.length}  ${Math.round((Date.now() - t0) / 1000)}s  ${JSON.stringify(ck.counts)}`);
      }
    }
    console.log(`[eval] done ${JSON.stringify(ck.counts)}`);
  }

  // ---- PHASE 3. Prediction-blind negative control OUTSIDE the prefilter. ----
  if (PHASE === 'all' || PHASE === 'control') {
    const inSet = new Set(ids);
    const rows = await sql.unsafe(
      `select id::text as id, court, full_text from judgments
       where full_text is not null
       order by md5(id::text) limit ${CONTROL_N}`,
    );
    const counts: Counts = {};
    writeFileSync(CONTROL, '');
    for (const r of rows as { id: string; court: string; full_text: string }[]) {
      const outside = !inSet.has(r.id);
      bump(counts, outside ? 'SAMPLED_OUTSIDE_PREFILTER' : 'SAMPLED_INSIDE_PREFILTER');
      const oldOut = all(OLD, r.full_text);
      const newOut = all(NEW, r.full_text);
      const changed = oldOut.length !== newOut.length || oldOut.some((v, k) => v !== newOut[k]);
      if (!changed) continue;
      bump(counts, outside ? 'CHANGED_OUTSIDE_PREFILTER' : 'CHANGED_INSIDE_PREFILTER');
      appendFileSync(
        CONTROL,
        `${JSON.stringify({ id: r.id, court: r.court, outside, old: oldOut.slice(0, 5), new: newOut.slice(0, 5) })}\n`,
      );
    }
    console.log(`[control] ${JSON.stringify(counts)}`);
    writeFileSync(
      join(OUTDIR, 'negative-control.json'),
      JSON.stringify({ sampled: rows.length, counts, universeHash }, null, 1),
    );
  }

  console.log(`AFFECTED_UNIVERSE_HASH=${universeHash}`);
} finally {
  await sql.end();
}
