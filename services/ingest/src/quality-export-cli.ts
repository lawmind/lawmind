/**
 * NEW2 — THE MACHINE-READABLE QUALITY EXPORT LCC AND NEW1 ASKED FOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT EMITS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One JSON object per line, one line per document:
 *
 *   documentId · court · judgmentYear · valueBand · textLength
 *   documentRole      + roleMethod
 *   disposition       (the registry string, verbatim, never interpreted)
 *   textQuality       + textMethod + englishRate + markerRate
 *   identityState     + memberCount
 *   citability        (derived from the three above, at read time)
 *   admittedToTierA   (the deployed eligibility predicate's own answer)
 *   version           (`QUALITY_STATE_VERSION`)
 *
 * JSONL rather than a table, and the reason is the one in `quality-state.ts`:
 * these verdicts come from screens that will change as more courts are labelled,
 * and a stored verdict from a superseded screen is indistinguishable from a
 * current one. An export carries its version in every row and is regenerated;
 * a column has to be invalidated, and nothing invalidates it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SUMMARY IS NOT A SIDE EFFECT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every run writes a summary beside the rows: counts per axis, and the crosstab
 * of citability against admission. That crosstab is the point of the whole
 * export — it is the answer to "how much of what the semantic core admits is
 * actually citable", and reading it off the rows afterwards is a step somebody
 * eventually skips.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED BY DEFAULT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Keyset on `id`, `--limit` rows, and the text is read as `substr(full_text, 1,
 * 20000)` so the detoast per row is capped. Running this over the whole corpus
 * is a `DB_SCAN`-class job and would take hours; the default is a bounded slice,
 * and `--courts` narrows it to the population a question is actually about.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/quality-export-cli.ts [--limit 20000] [--courts 3_22,29_3] \
 *     [--out ../../docs/ops/migration/new2-quality-export.jsonl]
 */
import { createWriteStream, writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import {
  QUALITY_STATE_VERSION,
  citability,
  identityState,
  roleVerdict,
  textVerdict,
  type Citability,
} from './quality-state.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const LIMIT = Number(argOf('limit', '20000'));
const PAGE = Number(argOf('page', '1000'));
const OUT = argOf('out');
const SUMMARY_OUT = argOf('summary');
const COURTS = (argOf('courts') ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);
const PROBE = 20000;

type Row = {
  id: string;
  court: string | null;
  judgment_date: string | null;
  case_number: string | null;
  case_title: string | null;
  content_hash: string | null;
  disposal_nature: string | null;
  hc_document_class: string | null;
  hc_class_method: string | null;
  script_quality: string | null;
  script_quality_method: string | null;
  text_quality: string | null;
  text_len: number | null;
  probe: string | null;
  member_count: number | null;
};

const sql = await openDb(url, 2, 10 * 60_000);

/* The deployed definition's hash, recorded in the summary. A quality export that
 * reports an admission share without saying which selector produced it is a
 * number nobody can reproduce after the next migration. */
const [view] = (await sql`
  SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def
`) as unknown as { def: string }[];
const { createHash } = await import('node:crypto');
const deployedHash = createHash('sha256')
  .update(view?.def ?? '')
  .digest('hex')
  .slice(0, 16);

const outStream = OUT ? createWriteStream(OUT, { encoding: 'utf8' }) : null;

const tally = new Map<string, number>();
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
/* citability × admitted. The crosstab this export exists to produce. */
const cross = new Map<string, number>();

let cursor = '00000000-0000-0000-0000-000000000000';
let seen = 0;
const started = Date.now();

try {
  while (seen < LIMIT) {
    const want = Math.min(PAGE, LIMIT - seen);
    const rows = (await sql`
      SELECT j.id,
             j.court,
             j.judgment_date::text                  AS judgment_date,
             j.case_number,
             j.case_title,
             j.content_hash,
             j.disposal_nature,
             j.hc_document_class,
             j.hc_class_method,
             j.script_quality,
             j.script_quality_method,
             j.text_quality::text                   AS text_quality,
             length(substr(j.full_text, 1, 200001)) AS text_len,
             substr(j.full_text, 1, ${PROBE})       AS probe,
             r.member_count::int                    AS member_count
        FROM judgments j
        LEFT JOIN embedding_content_representative r ON r.content_hash = j.content_hash
       WHERE j.id > ${cursor}::uuid
         ${COURTS.length ? sql`AND j.source_url LIKE ANY(${COURTS.map((c) => `%/court=${c}/%`)}::text[])` : sql``}
       ORDER BY j.id
       LIMIT ${want}`) as unknown as Row[];
    if (rows.length === 0) break;

    for (const r of rows) {
      seen++;
      const len = r.text_len ?? 0;
      const band =
        len >= 8000
          ? 'substantial'
          : len >= 4000
            ? 'full'
            : len >= 2000
              ? 'standard'
              : len >= 1000
                ? 'brief'
                : 'stub';

      const text = textVerdict({
        text: r.probe,
        storedScriptQuality: r.script_quality,
        storedScriptMethod: r.script_quality_method,
      });
      const role = roleVerdict({
        hcDocumentClass: r.hc_document_class,
        hcClassMethod: r.hc_class_method,
        text: r.probe,
      });
      const identity = identityState({
        contentHash: r.content_hash,
        caseNumber: r.case_number,
        judgmentDate: r.judgment_date,
        court: r.court,
        caseTitle: r.case_title,
        memberCount: r.member_count,
      });
      const cite: Citability = citability({ role: role.role, text: text.state, identity });

      /* The eligibility view's own answer, transcribed. Reported beside our
       * verdicts so the gap between "the selector admits it" and "it is citable"
       * is a number rather than an argument. */
      const tq = r.text_quality === null ? 0 : Number(r.text_quality);
      const admitted =
        identity !== 'weak' &&
        len > 0 &&
        tq >= 0.85 &&
        (r.script_quality === null || ['clean', 'mixed_script_ok'].includes(r.script_quality)) &&
        (r.hc_document_class === null ||
          !['procedural_disposal', 'reference_stub'].includes(r.hc_document_class)) &&
        r.hc_document_class !== 'bail_order' &&
        ['standard', 'full', 'substantial'].includes(band);

      bump(`role:${role.role}`);
      bump(`text:${text.state}`);
      bump(`identity:${identity}`);
      bump(`citability:${cite}`);
      bump(`band:${band}`);
      cross.set(
        `${cite}|${admitted ? 'admitted' : 'rejected'}`,
        (cross.get(`${cite}|${admitted ? 'admitted' : 'rejected'}`) ?? 0) + 1,
      );

      outStream?.write(
        `${JSON.stringify({
          documentId: r.id,
          court: r.court,
          judgmentYear: r.judgment_date ? Number(r.judgment_date.slice(0, 4)) : null,
          valueBand: band,
          textLength: len,
          documentRole: role.role,
          roleMethod: role.method,
          /* Verbatim. It is registry bookkeeping about a FILE and is never
           * interpreted into a role or a citability here. */
          disposition: r.disposal_nature,
          textQuality: text.state,
          textMethod: text.method,
          englishRate: Number(text.englishRate.toFixed(2)),
          markerRate: Number(text.markerRate.toFixed(3)),
          identityState: identity,
          memberCount: r.member_count ?? 1,
          citability: cite,
          admittedToTierA: admitted,
          version: QUALITY_STATE_VERSION,
        })}\n`,
      );
    }

    cursor = rows[rows.length - 1]!.id;
    if (seen % 5000 === 0 || rows.length < want) {
      console.log(
        `${seen.toLocaleString()} rows · ${(seen / Math.max(1, (Date.now() - started) / 1000)).toFixed(0)}/s`,
      );
    }
    if (rows.length < want) break;
  }

  const group = (prefix: string) =>
    Object.fromEntries(
      [...tally.entries()]
        .filter(([k]) => k.startsWith(`${prefix}:`))
        .map(([k, v]) => [k.slice(prefix.length + 1), v])
        .sort((a, b) => (b[1] as number) - (a[1] as number)),
    );

  const summary = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    version: QUALITY_STATE_VERSION,
    deployedEligibilityViewHash: deployedHash,
    rows: seen,
    courts: COURTS.length ? COURTS : 'all',
    walk: 'keyset on judgments.id from the start of the key space — a bounded PREFIX of the corpus, not a sample of it',
    documentRole: group('role'),
    textQuality: group('text'),
    identityState: group('identity'),
    citability: group('citability'),
    valueBand: group('band'),
    citabilityByAdmission: Object.fromEntries([...cross.entries()].sort((a, b) => b[1] - a[1])),
    caveats: [
      'This walk is a PREFIX of the id space, not a uniform sample. judgments.id is uuid v4 so a prefix is unbiased with respect to court and date, but it is NOT unbiased with respect to anything correlated with when a row was classified — the classifier walks the same key order, so early ids are far more likely to carry a stored class. For a uniform estimate use semantic-core-audit-cli.ts, which draws rather than walks.',
      'textQuality KNOWN_GOOD comes only from a STORED verdict. Nothing here upgrades a document to KNOWN_GOOD from the absence of a defect, so a low KNOWN_GOOD count means the screens have not run, never that the corpus is bad.',
      'englishRate and markerRate are computed on the first 20,000 characters. For standard and full bands that is the whole document; for substantial it is not, and a rate there is a rate over the opening.',
      'disposition is the raw registry string. It is exported so a consumer can see it, and it is deliberately not mapped into a role or a citability by this tool.',
      'citability never reads overruled_status. Good-law status is read live at render on every surface and must not be cached into a derived quality state.',
    ],
  };

  const summaryPath = SUMMARY_OUT ?? (OUT ? `${OUT.replace(/\.jsonl$/, '')}-summary.json` : null);
  if (summaryPath) writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    [
      '',
      `rows                 ${seen.toLocaleString()}`,
      `eligibility view     ${deployedHash}`,
      '',
      'document role:',
      ...Object.entries(summary.documentRole).map(
        ([k, v]) =>
          `  ${k.padEnd(20)} ${String(v).padStart(8)}  ${((100 * (v as number)) / seen).toFixed(1)}%`,
      ),
      '',
      'text quality:',
      ...Object.entries(summary.textQuality).map(
        ([k, v]) =>
          `  ${k.padEnd(20)} ${String(v).padStart(8)}  ${((100 * (v as number)) / seen).toFixed(1)}%`,
      ),
      '',
      'citability:',
      ...Object.entries(summary.citability).map(
        ([k, v]) =>
          `  ${k.padEnd(20)} ${String(v).padStart(8)}  ${((100 * (v as number)) / seen).toFixed(1)}%`,
      ),
      '',
      'citability x admission:',
      ...Object.entries(summary.citabilityByAdmission).map(
        ([k, v]) => `  ${k.padEnd(34)} ${String(v).padStart(8)}`,
      ),
      summaryPath ? `\nsummary ${summaryPath}` : '',
      OUT ? `rows    ${OUT}` : '',
    ].join('\n'),
  );
} finally {
  outStream?.end();
  await sql.end({ timeout: 5 });
}
