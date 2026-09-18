/**
 * LCC — ADVANCE THE TRUST LADDER. `SPAN_VERIFIED` → `SEMANTIC_ROLE_VERIFIED`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Migration `0064` defined four trust states and left the third one empty on
 * purpose — *"Nothing reaches this state yet and the column says so honestly
 * rather than flattering the pipeline."* This is the thing that fills it.
 *
 * Every `SPAN_VERIFIED` row in an adjudicable task is re-read against the
 * document's own structure by `semantic-role.ts`. No model is consulted. The
 * evidence is WHERE the span sits relative to the judgment's voice changes,
 * which is a fact about the file rather than an opinion about the sentence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE UNIT IS THE CLAIM. THE COLUMN IS A ROW. BOTH TRUTHS ARE KEPT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A `holding` row holds six claims, and three of them can be the court's own
 * words while two are the petitioner's contention and one is a quoted passage
 * from a Supreme Court judgment. Promoting or refusing the ROW throws away most
 * of that, in whichever direction it errs.
 *
 * So both are written and neither is inferred from the other:
 *
 *   * **per claim** — the full verdict, into `parsed_output.roleVerification`.
 *     Additive: `claims` is never touched, because it is the model's parsed
 *     output and rewriting it would destroy the thing every verification is
 *     measured against.
 *   * **per row** — `trust_state` advances only when EVERY adjudicable claim in
 *     the row is `CANONICAL_ACCEPT` and at least one claim was adjudicable. The
 *     coarse column stays conservative; the fine truth stays queryable.
 *
 * A row with one mismatch does not advance and its accepted claims are still
 * recorded, so a consumer that wants claim-level material can have it without
 * this CLI having to pretend the row is clean.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CAN ONLY EVER MOVE ONE STEP, AND ONLY UPWARD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The `WHERE` clause is `trust_state = 'SPAN_VERIFIED'`. A `CANONICAL_TRUSTED`
 * row is never touched, a `MODEL_PROPOSED` row is never skipped ahead — 0064:
 * *"The states are ordered and a row may not skip one."* Re-running is safe and
 * idempotent: a row that advanced is no longer in the population.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/semantic-role-cli.ts [--task holding] [--limit 2000] [--confirm]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openDb } from './db-host.ts';
import {
  SEMANTIC_ROLE_VERSION,
  verifyRole,
  type RoleOutcome,
  type RoleVerdict,
} from './semantic-role.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const RESTART = process.argv.includes('--restart');
const LIMIT = Number(argOf('limit', '0'));
const BATCH = Number(argOf('batch', '200'));
const TASKS = (argOf('task') ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const JSON_OUT = argOf('json', 'docs/ai/lcc-semantic-core/role-verification.json')!;
const JSONL_OUT = argOf('jsonl', 'docs/ai/lcc-semantic-core/role-claims.jsonl')!;

/**
 * The tasks whose claims `semantic-role.ts` can adjudicate.
 *
 * `metadata`, `topics` and `authorities` are absent and that is not an
 * oversight. A judge's name and a topic label are not spans playing a role in
 * the document's argument, and an authority's role question is "does this
 * citation resolve to a real judgment", which is the citation harness's job and
 * a different kind of evidence entirely.
 */
const ADJUDICABLE_TASKS = [
  'holding',
  'issue',
  'relief',
  'reasoning_proposition',
  'arguments',
  'procedural_event',
  'court_action',
] as const;

const CKPT = join(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
  '.checkpoints',
  `semantic-role-${TASKS.length ? TASKS.join('-') : 'all'}.json`,
);

type Checkpoint = {
  tasks: string[];
  cursor: string;
  rows: number;
  claims: number;
  promotedRows: number;
  byOutcome: Record<string, number>;
  byRoleOutcome: Record<string, number>;
  byRule: Record<string, number>;
  startedAt: string;
  updatedAt: string;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const fresh = (): Checkpoint => ({
  tasks: TASKS.length ? TASKS : [...ADJUDICABLE_TASKS],
  cursor: ZERO_UUID,
  rows: 0,
  claims: 0,
  promotedRows: 0,
  byOutcome: {},
  byRoleOutcome: {},
  byRule: {},
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function loadCheckpoint(): Checkpoint {
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    return JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
  } catch {
    return fresh();
  }
}

function saveCheckpoint(c: Checkpoint): void {
  mkdirSync(dirname(CKPT), { recursive: true });
  c.updatedAt = new Date().toISOString();
  writeFileSync(CKPT, JSON.stringify(c, null, 1));
}

/**
 * `script_quality` → the eligibility contract's `text_safety` state.
 *
 * Mirrors migration 0067's CASE exactly. It is duplicated here rather than read
 * from the view for one reason: this CLI walks `document_enrichments` and would
 * otherwise have to join an 18.7M-row view for a column that is a function of
 * one already-selected field. `semantic-role-contract.test.ts` asserts the two
 * agree against the deployed catalogue, so the duplication is checked rather
 * than trusted.
 */
export function textSafetyOf(
  scriptQuality: string | null,
): 'UNKNOWN' | 'SCREENED_OK' | 'UNSAFE_VERIFIED' | 'SCREENED_OTHER' {
  if (scriptQuality === null) return 'UNKNOWN';
  if (scriptQuality === 'clean' || scriptQuality === 'mixed_script_ok') return 'SCREENED_OK';
  if (
    scriptQuality === 'legacy_font_ascii' ||
    scriptQuality === 'devanagari_deleted' ||
    scriptQuality === 'damaged_other'
  ) {
    return 'UNSAFE_VERIFIED';
  }
  return 'SCREENED_OTHER';
}

type Row = {
  id: string;
  task: string;
  judgment_id: string;
  parsed_output: { claims?: { kind?: string; evidence?: string | null }[] } | null;
  full_text: string | null;
  judgment_date: string | null;
  script_quality: string | null;
};

const sql = await openDb(url, 2, 10 * 60_000);
const ckpt = loadCheckpoint();
const started = Date.now();
const tasks = ckpt.tasks;

mkdirSync(dirname(join(process.cwd(), JSONL_OUT)), { recursive: true });
const jsonlRows: string[] = [];

console.log(
  `semantic-role ${SEMANTIC_ROLE_VERSION} · tasks=${tasks.join(',')} · ` +
    `${CONFIRM ? 'WRITING' : 'DRY RUN'} · resume from ${ckpt.cursor}`,
);

for (;;) {
  const want = LIMIT > 0 ? Math.min(BATCH, LIMIT - ckpt.rows) : BATCH;
  if (want <= 0) break;

  const rows = await sql<Row[]>`
    SELECT de.id, de.task, de.judgment_id, de.parsed_output,
           j.full_text, j.judgment_date::text AS judgment_date, j.script_quality
      FROM document_enrichments de
      JOIN judgments j ON j.id = de.judgment_id
     WHERE de.trust_state = 'SPAN_VERIFIED'
       AND de.task = ANY(${tasks}::text[])
       AND de.id > ${ckpt.cursor}::uuid
     ORDER BY de.id
     LIMIT ${want}`;

  if (rows.length === 0) break;

  const promote: string[] = [];
  const verdictsById = new Map<string, unknown>();

  for (const r of rows) {
    const claims = r.parsed_output?.claims ?? [];
    const safety = textSafetyOf(r.script_quality);
    const perClaim: (RoleVerdict & { kind: string; index: number })[] = [];

    let adjudicable = 0;
    let accepted = 0;

    claims.forEach((claim, index) => {
      const kind = claim.kind ?? 'unknown';
      const span = claim.evidence ?? '';
      if (span.length === 0) return;

      const v = verifyRole({
        role: kind,
        span,
        fullText: r.full_text ?? '',
        documentTextSafety: safety,
        judgmentDate: r.judgment_date,
      });

      perClaim.push({ ...v, kind, index });
      ckpt.claims += 1;
      ckpt.byOutcome[v.outcome] = (ckpt.byOutcome[v.outcome] ?? 0) + 1;
      const rk = `${kind}:${v.outcome}`;
      ckpt.byRoleOutcome[rk] = (ckpt.byRoleOutcome[rk] ?? 0) + 1;
      ckpt.byRule[v.rule] = (ckpt.byRule[v.rule] ?? 0) + 1;

      /* `ROLE_UNPROVEN` is not adjudicable: the verifier looked and could not
       * decide, which is neither evidence for nor against. Counting it as a
       * failure would make a row's promotion depend on how many claims the
       * verifier happens to have no rule for. */
      if (v.outcome === 'CANONICAL_ACCEPT') {
        adjudicable += 1;
        accepted += 1;
      } else if (v.outcome === 'ROLE_MISMATCH') {
        adjudicable += 1;
      }

      jsonlRows.push(
        JSON.stringify({
          enrichmentId: r.id,
          judgmentId: r.judgment_id,
          task: r.task,
          claimIndex: index,
          kind,
          outcome: v.outcome,
          rule: v.rule,
          relativePosition: v.relativePosition,
          precedingMarkerKind: v.precedingMarkerKind,
          windowEnglishRate:
            v.windowEnglishRate === null ? null : Number(v.windowEnglishRate.toFixed(2)),
          spanChars: span.length,
        }),
      );
    });

    verdictsById.set(r.id, {
      version: SEMANTIC_ROLE_VERSION,
      at: new Date().toISOString(),
      documentTextSafety: safety,
      claims: perClaim.map((v) => ({
        index: v.index,
        kind: v.kind,
        outcome: v.outcome,
        rule: v.rule,
      })),
    });

    if (adjudicable > 0 && accepted === adjudicable) promote.push(r.id);
    ckpt.rows += 1;
  }

  if (CONFIRM) {
    /* The per-claim record first, for EVERY row walked — including the ones
     * that will not be promoted. A row that was examined and refused must be
     * distinguishable from one nothing has looked at, which is the same
     * `UNKNOWN is not BAD` discipline the eligibility contract runs on. */
    const ids = [...verdictsById.keys()];
    const payloads = ids.map((id) => JSON.stringify(verdictsById.get(id)));
    await sql`
      UPDATE document_enrichments AS de
         SET parsed_output = COALESCE(de.parsed_output, '{}'::jsonb)
                             || jsonb_build_object('roleVerification', v.payload::jsonb)
        FROM (
          SELECT unnest(${ids}::uuid[]) AS id,
                 unnest(${payloads}::text[]) AS payload
        ) AS v
       WHERE de.id = v.id`;

    if (promote.length > 0) {
      await sql`
        UPDATE document_enrichments
           SET trust_state = 'SEMANTIC_ROLE_VERIFIED',
               trust_rank = 3,
               trust_advanced_by = ${`semantic-role-cli:${SEMANTIC_ROLE_VERSION}`},
               trust_advanced_at = now()
         WHERE id = ANY(${promote}::uuid[])
           -- Only ever one step, only ever upward.
           AND trust_state = 'SPAN_VERIFIED'`;
    }
  }

  ckpt.promotedRows += promote.length;
  ckpt.cursor = rows[rows.length - 1]!.id;
  saveCheckpoint(ckpt);

  const secs = (Date.now() - started) / 1000;
  console.log(
    `  ${ckpt.rows.toLocaleString()} rows · ${ckpt.claims.toLocaleString()} claims · ` +
      `${ckpt.promotedRows.toLocaleString()} rows ${CONFIRM ? 'promoted' : 'would promote'} · ` +
      `${(ckpt.rows / Math.max(1, secs)).toFixed(0)} rows/s`,
  );
}

if (jsonlRows.length > 0) {
  writeFileSync(JSONL_OUT, jsonlRows.join('\n') + '\n', { flag: 'a' });
}

const acceptedClaims = ckpt.byOutcome['CANONICAL_ACCEPT'] ?? 0;
const summary = {
  version: SEMANTIC_ROLE_VERSION,
  confirmed: CONFIRM,
  tasks,
  rowsWalked: ckpt.rows,
  claimsAdjudicated: ckpt.claims,
  claimsAccepted: acceptedClaims,
  claimAcceptRate:
    ckpt.claims === 0 ? 0 : Number(((100 * acceptedClaims) / ckpt.claims).toFixed(2)),
  rowsPromoted: ckpt.promotedRows,
  rowPromotionRate:
    ckpt.rows === 0 ? 0 : Number(((100 * ckpt.promotedRows) / ckpt.rows).toFixed(2)),
  byOutcome: ckpt.byOutcome,
  byRoleOutcome: ckpt.byRoleOutcome,
  byRule: ckpt.byRule,
  elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  finishedAt: new Date().toISOString(),
};

mkdirSync(dirname(join(process.cwd(), JSON_OUT)), { recursive: true });
writeFileSync(JSON_OUT, JSON.stringify(summary, null, 1));

console.log('');
console.log(`RESULTS  ${CONFIRM ? 'WRITTEN' : 'DRY RUN — nothing written'}`);
console.log(`  rows walked         ${ckpt.rows.toLocaleString()}`);
console.log(`  claims adjudicated  ${ckpt.claims.toLocaleString()}`);
console.log(
  `  rows promoted       ${ckpt.promotedRows.toLocaleString()} (${summary.rowPromotionRate}%)`,
);
console.log('  by outcome');
for (const [o, n] of Object.entries(ckpt.byOutcome).sort((a, b) => b[1] - a[1])) {
  const pct = ckpt.claims === 0 ? 0 : ((100 * n) / ckpt.claims).toFixed(1);
  console.log(`    ${(o as RoleOutcome).padEnd(22)} ${String(n).padStart(7)}  ${pct}%`);
}
console.log(`  summary             ${JSON_OUT}`);
console.log(`  per-claim           ${JSONL_OUT}`);

await sql.end();
