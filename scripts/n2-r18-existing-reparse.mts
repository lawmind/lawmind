/**
 * NEW2 — R18 §2/§4/§6. WHAT THE OLD EXTRACTOR LEFT IN THE CANONICAL CORPUS.
 *
 * The extractor fix `8ff7083d` changes FUTURE ingestion. Every neutral citation
 * already stored on a High Court row was produced by the rule it replaced — the
 * one that took the first regex match in the opening 3,000 characters on a year
 * test alone. This re-runs the COMMITTED extractor over that stored population
 * and classifies each row by what the two rules say.
 *
 * EXHAUSTIVE, not sampled. The walk is keyed on `judgments_neutral_citation_key`
 * (a btree on the normalised citation over every row), so it visits the 1.35M
 * rows that carry a citation and never the 17.3M that do not. Batched, keyset
 * paginated and checkpointed after every batch: a resource stop leaves a durable
 * cursor, not a lost run. It takes no lease, writes no `judgments` row and holds
 * no transaction open across a batch.
 *
 * Read-only. Database, no network.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r18-existing-reparse.mts \
 *     [--batch 2000] [--limit 0] [--resume]
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyOccurrence,
  neutralCitationFrom,
  ownCaseNumberPair,
  type OccurrenceVerdict,
} from '../services/ingest/src/harvest/hc-load.ts';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const has = (n: string) => process.argv.includes(`--${n}`);
const OUTDIR = join(ROOT, arg('outdir', 'docs/ai/new2-r18'));
const CKPT = join(OUTDIR, 'reparse-checkpoint.json');
const ROWS_OUT = join(OUTDIR, 'candidate-rows.jsonl');
const BATCH = Number(arg('batch', '2000'));
const LIMIT = Number(arg('limit', '0'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** The rule that produced every stored value: first match in 3,000 chars, year test only. */
const NEUTRAL_ONE = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/;
const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
function armOld(t: string, year: number): string | null {
  const m = NEUTRAL_ONE.exec(t.slice(0, 3000));
  if (!m) return null;
  const c = Number(m[1]);
  return c === year || c === year - 1 ? m[0] : null;
}

const MONTHS = new Set([
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
  'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JAN', 'FEB', 'MAR', 'APR',
  'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC', 'SEPTEMEBER', 'AGT',
]);

/** Damage screen — the same one measured as an arm in R17, reproduced verbatim. */
function damaged(t: string): boolean {
  if (t.length === 0) return true;
  let ctrl = 0;
  for (let k = 0; k < t.length; k++) {
    const cc = t.charCodeAt(k);
    if ((cc < 32 && cc !== 9 && cc !== 10 && cc !== 13) || (cc >= 0xe000 && cc <= 0xf8ff)) ctrl++;
  }
  const words = t.match(/[A-Za-z]{3,}/g) ?? [];
  return ctrl / t.length > 0.02 || words.length / Math.max(1, t.length / 6) < 0.35;
}

const tokenOf = (c: string | null): string | null =>
  c ? (/^\d{4}:([A-Z][A-Z-]{1,13}):/.exec(c)?.[1] ?? null) : null;

type Row = {
  id: string;
  court: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string;
  source_url: string | null;
  content_hash: string | null;
  judgment_date: string | null;
  full_text: string | null;
  k: string;
};

type Counts = Record<string, number>;
const bump = (m: Counts, k: string, by = 1): void => {
  m[k] = (m[k] ?? 0) + by;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

const NL = String.fromCharCode(10);
/** Every neutral-citation occurrence, WITHOUT the suffix logic, so the suffix can be judged rather than assumed. */
const OCC_BASE = /\b(\d{4}):([A-Z][A-Z-]{1,13}):(\d{1,6})/g;
const KEYEXPR = "upper(regexp_replace(coalesce(neutral_citation,''),'[^A-Za-z0-9]','','g'))";

try {
  mkdirSync(OUTDIR, { recursive: true });

  // ---- 1. The token home map. Exhaustive, SQL only, no text. ----------------
  // A neutral-citation series belongs to ONE court. Where a token's rows are
  // overwhelmingly one court's, that court is its home, and a row filed under it
  // anywhere else is carrying another court's number — provable without reading
  // a single document.
  const TOKENS_CACHE = join(OUTDIR, 'token-court-matrix.json');
  let tokenRows: { court: string; tok: string | null; n: string }[];
  if (existsSync(TOKENS_CACHE) && !has('recount')) {
    tokenRows = JSON.parse(readFileSync(TOKENS_CACHE, 'utf8')).rows;
    console.log(`[r18] token matrix read from ${TOKENS_CACHE} (--recount to rebuild)`);
  } else {
    tokenRows = await sql<{ court: string; tok: string | null; n: string }[]>`
      SELECT court, substring(neutral_citation from '^[0-9]{4}:([A-Z][A-Z-]{1,13}):') AS tok, count(*)::text AS n
        FROM judgments
       WHERE ${sql.unsafe(KEYEXPR)} > ''
         AND source_url LIKE '%indian-high-court-judgments%'
       GROUP BY 1, 2`;
    writeFileSync(
      TOKENS_CACHE,
      JSON.stringify({ artifact: 'NEW2_R18_TOKEN_COURT_MATRIX', takenAt: new Date().toISOString(), rows: tokenRows }, null, 1) + NL,
    );
  }
  const byToken = new Map<string, Map<string, number>>();
  for (const r of tokenRows) {
    if (!r.tok) continue;
    const m = byToken.get(r.tok) ?? new Map<string, number>();
    m.set(r.court, (m.get(r.court) ?? 0) + Number(r.n));
    byToken.set(r.tok, m);
  }
  const HOME_MIN_ROWS = 25;
  const HOME_MIN_SHARE = 0.9;
  const homeOf = new Map<string, string>();
  const tokenTotals: Record<string, { total: number; home: string | null; share: number }> = {};
  for (const [tok, m] of byToken) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const top = [...m].sort((a, b) => b[1] - a[1])[0]!;
    const share = top[1] / total;
    const home = total >= HOME_MIN_ROWS && share >= HOME_MIN_SHARE ? top[0] : null;
    if (home) homeOf.set(tok, home);
    tokenTotals[tok] = { total, home, share: Number(share.toFixed(4)) };
  }
  console.log(`[r18] tokens ${byToken.size}, with a home court ${homeOf.size}`);

  // ---- 2. The walk. --------------------------------------------------------
  // The keyset is (key, id), NOT key alone. A neutral citation names several
  // connected matters, so thousands of rows SHARE a normalised key; a cursor of
  // `key > last` silently skips every remaining row of a key that straddled a
  // batch boundary. The first run of this walk did exactly that and came back
  // 1,405 rows short of the census — which is how the defect was found, and why
  // the census is compared to the walk rather than assumed to agree with it.
  // `KEYEXPR > ''` is not redundant beside the seek: without it the first page
  // asks the planner for `>= ''`, which is every row in the index — including
  // the 17.3M with no citation, all sharing the empty key — and ORDER BY
  // (key, id) then has to sort that whole plateau by id before returning 2,000
  // rows. Measured: the first batch had not returned after 15 seconds and was
  // stopped. With the strict bound the seek starts at the first real key.
  let cursor = '';
  let cursorId = '00000000-0000-0000-0000-000000000000';
  let seenTotal = 0;
  const cls: Counts = {};
  const arms: Counts = {};
  const byCourt: Record<string, Counts> = {};
  const dbSuffix: Counts = {};
  const dbOcc: Counts = {};
  const dbGlueTails: Counts = {};
  const samples: Record<string, unknown[]> = {};
  const startedAt = new Date().toISOString();

  if (has('resume') && existsSync(CKPT)) {
    const c = JSON.parse(readFileSync(CKPT, 'utf8'));
    cursor = c.cursor ?? '';
    cursorId = c.cursorId ?? '00000000-0000-0000-0000-000000000000';
    seenTotal = c.rowsEvaluated ?? 0;
    Object.assign(cls, c.classes ?? {});
    Object.assign(arms, c.arms ?? {});
    Object.assign(byCourt, c.byCourt ?? {});
    Object.assign(dbSuffix, c.dbSuffix ?? {});
    Object.assign(dbOcc, c.dbOccurrences ?? {});
    Object.assign(dbGlueTails, c.dbGlueTails ?? {});
    Object.assign(samples, c.samples ?? {});
    console.log(`[r18] resumed at cursor ${cursor}, ${seenTotal} rows`);
  } else {
    writeFileSync(ROWS_OUT, '');
  }

  const t0 = Date.now();
  for (;;) {
    const rows = await sql<Row[]>`
      SELECT id, court, case_number, cnr, neutral_citation, source_url, content_hash,
             judgment_date::text AS judgment_date, full_text,
             ${sql.unsafe(KEYEXPR)} AS k
        FROM judgments
       WHERE ${sql.unsafe(KEYEXPR)} > ''
         AND ${sql.unsafe(KEYEXPR)} >= ${cursor}
         AND (${sql.unsafe(KEYEXPR)}, id) > (${cursor}, ${cursorId}::uuid)
         AND source_url LIKE '%indian-high-court-judgments%'
       ORDER BY ${sql.unsafe(KEYEXPR)}, id
       LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.k;
    cursorId = rows[rows.length - 1]!.id;
    const emit: string[] = [];

    for (const r of rows) {
      seenTotal++;
      const stored = r.neutral_citation;
      const text = r.full_text ?? '';
      const py = /year=(\d{4})/.exec(r.source_url ?? '');
      const tok = tokenOf(stored);
      const home = tok ? (homeOf.get(tok) ?? null) : null;
      const offCourt = home !== null && home !== r.court;
      const monthToken = tok !== null && MONTHS.has(tok);
      const bc = (byCourt[r.court] ??= {});

      let klass: string;
      let candidate: string | null = null;
      let tier: OccurrenceVerdict | 'NONE' = 'NONE';
      let distinctEligible = 0;
      let oldArm: string | null = null;
      let storedTiers: OccurrenceVerdict[] = [];
      let storedIsEligibleOccurrence = false;
      const storedFoundInText = text.length > 0 && text.includes(stored);

      // A rare or unplaceable court token is an ANNOTATION, not a verdict: it is
      // recorded on the row and the extractor still decides. The one structural
      // bypass is a month name, which is a date stamp the old regex matched and
      // is not a neutral citation of any court's series at all.
      if (monthToken) {
        klass = 'NOT_A_NEUTRAL_CITATION_DATE_STAMP';
      } else if (!py || text.length === 0 || damaged(text)) {
        klass = 'UNTESTABLE';
      } else {
        const year = Number(py[1]);
        candidate = neutralCitationFrom(text, year, { caseNumber: r.case_number, cnr: r.cnr });
        oldArm = armOld(text, year);

        const own = ownCaseNumberPair(r.case_number);
        const ownCnr = r.cnr?.trim() || null;
        const eligible = new Set<string>();
        const tiers = new Map<string, OccurrenceVerdict[]>();
        const scan = new RegExp(NEUTRAL_G.source, NEUTRAL_G.flags);
        for (let m = scan.exec(text); m; m = scan.exec(text)) {
          const cy = Number(m[1]);
          if (cy !== year && cy !== year - 1) continue;
          eligible.add(m[0]);
          const v = classifyOccurrence(text, m.index, m[0], own, ownCnr);
          const l = tiers.get(m[0]) ?? [];
          l.push(v);
          tiers.set(m[0], l);
        }
        distinctEligible = eligible.size;
        storedIsEligibleOccurrence = eligible.has(stored);
        storedTiers = [...new Set(tiers.get(stored) ?? [])];
        if (candidate) {
          const vs = tiers.get(candidate) ?? [];
          tier = vs.includes('OWN_ID') ? 'OWN_ID' : vs.includes('OWN_POS') ? 'OWN_POS' : (vs[0] ?? 'NONE');
        }

        if (candidate === stored) {
          klass = offCourt ? 'SOURCE_GENUINE_FOREIGN_CITATION' : 'UNCHANGED_CONFIRMED';
        } else if (candidate !== null) {
          // A replacement must be anchored on the row's OWN identity. Anything
          // weaker is a competing reading, not a correction.
          klass = tier === 'OWN_ID' ? 'REPLACE_WITH_DIFFERENT_OWN_CITATION' : 'AMBIGUOUS';
        } else {
          klass = distinctEligible >= 2 ? 'AMBIGUOUS' : 'CLEAR_TO_NULL';
        }
      }

      bump(cls, klass);
      bump(bc, klass);
      bump(arms, offCourt ? 'off_court_token' : 'in_court_token');
      if (oldArm !== null) bump(arms, oldArm === stored ? 'old_arm_reproduces_stored' : 'old_arm_differs_from_stored');

      // ---- §4. the -DB / token-boundary defect, per OCCURRENCE ---------------
      // The shared regex ends its optional `(?:-(?:DB|FB))?` in a ``. On
      // `2025:DHC:8491-DBThis` the `B|T` pair is not a boundary, so the suffix
      // alternative fails, the group matches EMPTY, and the `\b` after `8491`
      // succeeds against the `-`. The regex does not fail — it silently returns
      // a DIFFERENT citation key. Every occurrence is counted, never inferred.
      if (text.length > 0) {
        const occ = new RegExp(OCC_BASE.source, OCC_BASE.flags);
        for (let m = occ.exec(text); m; m = occ.exec(text)) {
          const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 18);
          const sm = /^-(DB|FB)/.exec(tail);
          if (!sm) {
            bump(dbOcc, 'occurrence_no_suffix');
            continue;
          }
          const after = tail.charAt(3);
          const glued = after !== '' && /[A-Za-z0-9_]/.test(after);
          bump(dbOcc, glued ? 'occurrence_suffix_GLUED' : 'occurrence_suffix_with_boundary');
          if (glued) {
            // What the suffix was glued TO. A safe fix must be shown not to be
            // eating a longer real token, so the continuations are tallied.
            bump(dbGlueTails, tail.slice(3, 15).replace(/\s+/g, ' '));
            // Does the SAME document also print this citation with a boundary?
            // Where it does, the suffixed form is corroborated by the document
            // itself and the key is recoverable without any new assumption.
            const full = `${m[0]}-${sm[1]}`;
            let corroborated = false;
            let at = text.indexOf(full);
            while (at >= 0) {
              const nx = text.charAt(at + full.length);
              if (nx === '' || !/[A-Za-z0-9_]/.test(nx)) {
                corroborated = true;
                break;
              }
              at = text.indexOf(full, at + 1);
            }
            bump(dbOcc, corroborated ? 'glued_CORROBORATED_elsewhere_in_document' : 'glued_only_occurrence');
            const bucket = (samples[corroborated ? 'db_glue_corroborated' : 'db_glue_uncorroborated'] ??= []);
            if (bucket.length < 30) {
              bucket.push({
                id: r.id,
                court: r.court,
                stored,
                occurrence: m[0],
                suffixed: full,
                evidence: text.slice(Math.max(0, m.index - 90), m.index + m[0].length + 60).replace(/\s+/g, ' ').trim(),
              });
            }
          }
        }
      }

      // ---- the -DB / token-boundary observation, per row ---------------------
      // The shared regex ends in `\b`, so `…8491-DBThis` cannot take the suffix
      // and falls back to `…8491`. Where the page prints a boundary after `-DB`
      // the suffix survives. Both sides are counted, never inferred.
      if (/-(DB|FB)$/.test(stored)) {
        bump(dbSuffix, 'stored_with_suffix');
      } else if (text.length > 0) {
        const i = text.indexOf(`${stored}-DB`) >= 0 ? text.indexOf(`${stored}-DB`) : text.indexOf(`${stored}-FB`);
        if (i >= 0) {
          const nxt = text.charAt(i + stored.length + 3);
          const boundary = nxt === '' || !/[A-Za-z0-9_]/.test(nxt);
          const key = boundary ? 'plain_stored_suffix_in_text_WITH_boundary' : 'plain_stored_suffix_in_text_GLUED';
          bump(dbSuffix, key);
          const sk = boundary ? 'db_boundary_ok' : 'db_glued';
          const bucket = (samples[sk] ??= []);
          if (bucket.length < 40) {
            bucket.push({
              id: r.id,
              court: r.court,
              stored,
              nextChar: nxt,
              evidence: text.slice(Math.max(0, i - 90), i + stored.length + 60).replace(/\s+/g, ' ').trim(),
            });
          }
        } else {
          bump(dbSuffix, 'plain_stored_no_suffix_in_text');
        }
      }

      if (klass !== 'UNCHANGED_CONFIRMED') {
        emit.push(
          JSON.stringify({
            judgmentId: r.id,
            court: r.court,
            caseNumber: r.case_number,
            cnr: r.cnr,
            judgmentDate: r.judgment_date,
            sourceUrl: r.source_url,
            contentHash: r.content_hash,
            storedNeutralCitation: stored,
            storedToken: tok,
            tokenHomeCourt: home,
            tokenCorpusRows: tok ? (tokenTotals[tok]?.total ?? 0) : 0,
            offCourt,
            storedFoundInText,
            storedIsEligibleOccurrence,
            storedOccurrenceTiers: storedTiers,
            candidateFromCommittedExtractor: candidate,
            candidateTier: tier,
            distinctEligibleCitationsInText: distinctEligible,
            reasonClass: klass,
          }),
        );
        const bucket = (samples[klass] ??= []);
        if (bucket.length < 25) bucket.push({ id: r.id, court: r.court, stored, candidate, tier, distinctEligible });
      }
    }

    if (emit.length) appendFileSync(ROWS_OUT, emit.join('\n') + '\n');

    writeFileSync(
      CKPT,
      JSON.stringify(
        {
          artifact: 'NEW2_R18_REPARSE_CHECKPOINT',
          lane: 'NEW2',
          startedAt,
          updatedAt: new Date().toISOString(),
          scope: 'EXHAUSTIVE over AWS Open Data High Court rows carrying a stored neutral_citation',
          cursor,
          cursorId,
          rowsEvaluated: seenTotal,
          classes: cls,
          arms,
          dbSuffix,
          dbOccurrences: dbOcc,
          dbGlueTails,
          byCourt,
          samples,
          tokenHomeMap: Object.fromEntries([...homeOf]),
          tokenTotals,
        },
        null,
        1,
      ) + '\n',
    );

    if (seenTotal % (BATCH * 10) < BATCH) {
      const rate = seenTotal / ((Date.now() - t0) / 1000);
      console.log(`[r18] ${seenTotal} rows, cursor ${cursor}, ${rate.toFixed(0)}/s, ${JSON.stringify(cls)}`);
    }
    if (LIMIT > 0 && seenTotal >= LIMIT) {
      console.log('[r18] --limit reached, stopping at a durable cursor');
      break;
    }
  }

  const body = readFileSync(CKPT, 'utf8');
  console.log('[r18] DONE rows', seenTotal);
  console.log('[r18] classes', JSON.stringify(cls, null, 1));
  console.log('[r18] dbSuffix', JSON.stringify(dbSuffix, null, 1));
  console.log('[r18] dbOccurrences', JSON.stringify(dbOcc, null, 1));
  console.log('[r18] checkpoint sha256', createHash('sha256').update(body).digest('hex'));
} finally {
  await sql.end();
}
