/**
 * LCC R32B — post-restore paragraph proof.
 *
 * Run against a RESTORED corpus database (never the source). Proves the two
 * product paths that depend on paragraphs actually return them:
 *
 *   Reader — the real `getJudgment` handler, mounted on a throwaway Hono app,
 *            returns a non-empty `paragraphs` array.
 *   Search — lexical-only `hybridSearch` returns hits whose evidence came from
 *            the `judgment_paragraphs` fallback: `operativeParagraphVerified`
 *            with a byte-exact `exactSpan`. In a restored generation with no
 *            `judgment_chunks` (they are not in the release), every hit is
 *            sparse-only, so any evidence it carries is the fallback's.
 *
 * Optional: `--citation "2022 INSC 690"` also resolves that citation through
 * `answerStructured` and reads its Reader view.
 *
 * Usage (from services/api):
 *   PROOF_DATABASE_URL=... node --import tsx ../../scripts/lcc-r32b-paragraph-proof.mts [--citation X]
 * Prints one JSON document on stdout; exit 0 only when every check passed.
 */
import { Hono } from 'hono';
import postgres from 'postgres';

import { getJudgment } from '../services/api/src/judgments/route.ts';
import { hybridSearch } from '../services/api/src/search/retrieve.ts';
import { answerStructured } from '../services/api/src/search/structured.ts';

const url = process.env['PROOF_DATABASE_URL'];
if (!url) {
  console.error('PROOF_DATABASE_URL is required');
  process.exit(2);
}
if (url === process.env['DATABASE_URL'] && !process.argv.includes('--allow-source')) {
  console.error('PROOF_DATABASE_URL equals DATABASE_URL; this proof runs against a restore');
  process.exit(2);
}
const argv = process.argv.slice(2);
const citationArg = (() => {
  const i = argv.indexOf('--citation');
  return i === -1 ? null : argv[i + 1] ?? null;
})();

const sql = postgres(url, { max: 4, onnotice: () => {} });
const app = new Hono();
app.get('/judgments/:id', (c) => getJudgment(c, sql, c.req.param('id')));

type Check = { name: string; pass: boolean; detail: Record<string, unknown> };
const checks: Check[] = [];

async function reader(id: string): Promise<{ status: number; paragraphs: number; title: unknown }> {
  const res = await app.request(`/judgments/${id}`);
  const body = (await res.json()) as Record<string, unknown>;
  const data = (body['data'] ?? body) as Record<string, unknown>;
  const paras = Array.isArray(data['paragraphs']) ? data['paragraphs'].length : 0;
  return { status: res.status, paragraphs: paras, title: data['caseTitle'] ?? data['case_title'] };
}

try {
  const [counts] = await sql<{ j: string; p: string; pj: string; ch: string; orphans: string }[]>`
    SELECT (SELECT count(*) FROM judgments)::text AS j,
           (SELECT count(*) FROM judgment_paragraphs)::text AS p,
           (SELECT count(DISTINCT judgment_id) FROM judgment_paragraphs)::text AS pj,
           (SELECT count(*) FROM judgment_chunks)::text AS ch,
           (SELECT count(*) FROM judgment_paragraphs p
             WHERE NOT EXISTS (SELECT 1 FROM judgments j WHERE j.id = p.judgment_id))::text AS orphans`;
  checks.push({
    name: 'paragraphs present, no orphans',
    pass: Number(counts?.p) > 0 && counts?.orphans === '0',
    detail: { ...counts },
  });

  // A judgment that has paragraphs AND safe body text, so the Reader serves it.
  const [pick] = await sql<{ id: string; term: string }[]>`
    SELECT p.judgment_id AS id,
           (regexp_matches(p.paragraph_text, '([A-Za-z]{7,})'))[1] AS term
      FROM judgment_paragraphs p
      JOIN judgments j ON j.id = p.judgment_id
     WHERE p.paragraph_index > 2 AND length(p.paragraph_text) > 200
       AND p.paragraph_text ~ '[A-Za-z]{7,}'
     ORDER BY p.judgment_id, p.paragraph_index
     LIMIT 1`;
  if (!pick) throw new Error('no judgment with a usable paragraph');

  const r = await reader(pick.id);
  checks.push({
    name: 'Reader paragraph retrieval',
    pass: r.status === 200 && r.paragraphs > 0,
    detail: { judgmentId: pick.id, ...r },
  });

  // Search: a set of ordinary research queries; the fallback must fill evidence.
  const queries = ['anticipatory bail', 'appeal dismissed', 'evidence witness', pick.term];
  let withEvidence = 0;
  let hitsTotal = 0;
  const perQuery: Record<string, unknown>[] = [];
  for (const q of queries) {
    const degraded: unknown[] = [];
    const started = performance.now();
    const hits = await hybridSearch(sql, q, null, {}, 10, 'sparse', (a) => degraded.push(a));
    const ev = hits.filter(
      (h) => h.operativeParagraphVerified && h.exactSpan && h.operativeParagraph.length > 0,
    );
    hitsTotal += hits.length;
    withEvidence += ev.length;
    perQuery.push({
      q,
      hits: hits.length,
      withParagraphEvidence: ev.length,
      ms: Math.round(performance.now() - started),
      degraded,
    });
  }
  checks.push({
    name: 'Search paragraph fallback',
    pass: withEvidence > 0,
    detail: { hitsTotal, withEvidence, perQuery },
  });

  if (citationArg) {
    const out = await answerStructured(sql, `cite:"${citationArg}"`, 5);
    const hits = out.kind === 'matched' ? out.hits : [];
    const first = hits[0] as { id?: string; judgmentId?: string } | undefined;
    const id = first?.id ?? first?.judgmentId ?? null;
    const rr = id ? await reader(id) : null;
    const [pc] = id
      ? await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgment_paragraphs WHERE judgment_id = ${id}`
      : [];
    checks.push({
      name: `exact citation ${citationArg}`,
      pass: hits.length === 1 && !!rr && rr.status === 200 && rr.paragraphs > 0,
      detail: { kind: out.kind, hits: hits.length, judgmentId: id, reader: rr, storedParagraphs: pc?.n },
    });
  }
} finally {
  await sql.end();
}

const pass = checks.every((c) => c.pass);
console.log(JSON.stringify({ at: new Date().toISOString(), pass, checks }, null, 2));
process.exit(pass ? 0 : 1);
