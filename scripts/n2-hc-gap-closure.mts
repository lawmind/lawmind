/**
 * NEW2 R10 closure: turn retry-budget rows into retained source artifacts,
 * current source-unavailable evidence, or an explicit actionable failure.
 *
 * No OCR runs here. Existing `no_text` rows are retained as
 * IMAGE_ONLY_OCR_PENDING; `pdf_failed` rows are re-probed in full and live PDFs
 * pass through the canonical extractor/mapper/upsert path.
 *
 * Modes:
 *   --mode closure      all no_text + pdf_failed rows (including stale ledger
 *                       rows already held, so the complete pdf_failed
 *                       population is re-probed)
 *   --mode revalidate   bounded pdf_absent revalidation when older than 90 days
 *                       or when its owning upstream scope changed
 *
 * Writes require --apply. The append-only official-source tables are the
 * durable row state; the JSONL journal makes a killed run resumable without
 * inserting duplicate observations.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres, { type Sql } from '../services/ingest/node_modules/postgres/src/index.js';

import { objectStoreFromEnv } from '../packages/storage/src/r2.ts';
import { chargeOperation, policyFromEnv, zeroCounts } from '../packages/storage/src/spend.ts';
import { upsertJudgments } from '../services/ingest/src/load.ts';
import { toJudgmentRecord, type HcMetadataRow } from '../services/ingest/src/harvest/hc-load.ts';
import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowGroupRanges,
  sampleRows,
  withTimeout,
} from '../services/ingest/src/harvest/hc-metadata.ts';
import { clearSucceeded, recordFailures } from '../services/ingest/src/harvest/ingest-ledger.ts';
import { extractPdfBytes, isNativeText, warmPdfEngine } from '../services/ingest/src/text.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = value('--mode', 'closure');
if (MODE !== 'closure' && MODE !== 'revalidate')
  throw new Error('--mode must be closure or revalidate');
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(value('--limit', MODE === 'closure' ? '0' : '2500'));
const CONCURRENCY = Number(value('--concurrency', '8'));
const REVALIDATE_DAYS = Number(value('--revalidate-days', '90'));
const OUT = join(ROOT, value('--out', `docs/ai/new2-r10/hc-${MODE}.json`));
const JOURNAL = join(ROOT, value('--journal', `.tmp-new2/hc-${MODE}-journal.jsonl`));
const CHANGED_SCOPES = join(ROOT, value('--changed-scopes', 'docs/ai/new2-r9/delta-scopes.json'));
const CONDITIONS_VERSION = 'aws-hc-cc-by-4.0-r10-source-retention-v1';
const METADATA_COLUMNS = [
  'pdf_link',
  'title',
  'cnr',
  'court',
  'decision_date',
  'disposal_nature',
  'order_type',
] as const;
const PDF_TIMEOUT_MS = 90_000;
const META_TIMEOUT_MS = 300_000;

function value(name: string, fallback: string): string {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
}

function loadEnv(): void {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
    if (!match || process.env[match[1]!] !== undefined) continue;
    process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
  }
}
loadEnv();

// Do not install the AWS-specific global dispatcher in this mixed-host worker.
// It also captures signed R2 PUTs. Native fetch keeps AWS and R2 on the same
// known-good client; concurrency remains bounded by this worker.
// pdf.js can also reject a background indexing promise after its awaited parse
// has already returned/failed. Contain that library-level rejection so one
// malformed PDF cannot kill the resumable population worker; the per-row
// awaited extraction still determines TEXT_AVAILABLE vs held-text-unavailable.
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[pdf-background-rejection] ${String(reason)}\n`);
});

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
if (!Number.isInteger(LIMIT) || LIMIT < 0)
  throw new Error('--limit must be a non-negative integer');
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 32) {
  throw new Error('--concurrency must be an integer from 1 to 32');
}

type Scope = { year: number; courtCode: string; bench: string };
type Target = {
  source_url: string;
  outcome: string;
  court_code: string;
  year: number;
  last_attempted_at: string;
  judgment_id: string | null;
  scope: Scope;
  basename: string;
};
type Metadata = { row: HcMetadataRow; scope: Scope; sourceKey: string };
type FinalState =
  | 'TEXT_READABLE'
  | 'IMAGE_ONLY_OCR_PENDING'
  | 'SOURCE_ARTIFACT_HELD_TEXT_UNAVAILABLE'
  | 'SOURCE_UNAVAILABLE_CURRENT'
  | 'POLICY_REFUSED'
  | 'ACTIONABLE_FAILURE';

function scopeOf(url: string): { scope: Scope; basename: string } {
  const match = /\/data\/pdf\/year=(\d+)\/court=([^/]+)\/bench=([^/]+)\/([^/?#]+)$/.exec(url);
  if (!match) throw new Error(`unparseable AWS HC source URL: ${url}`);
  return {
    scope: { year: Number(match[1]), courtCode: match[2]!, bench: match[3]! },
    basename: match[4]!,
  };
}

function scopeKey(scope: Scope): string {
  return `${scope.year}/${scope.courtCode}/${scope.bench}`;
}

function changedPredicates(): Array<(target: Target) => boolean> {
  if (!existsSync(CHANGED_SCOPES)) return [];
  const parsed = JSON.parse(readFileSync(CHANGED_SCOPES, 'utf8')) as {
    scopes?: Array<{ court?: string; year?: number; fromYear?: number; toYear?: number }>;
  };
  const exact: Array<(target: Target) => boolean> = [];
  for (const row of parsed.scopes ?? []) {
    const keys = (row as typeof row & { keys?: Array<{ key?: string }> }).keys ?? [];
    for (const item of keys) {
      const match = /year=(\d+)\/court=([^/]+)\/bench=([^/]+)\//.exec(item.key ?? '');
      if (!match) continue;
      exact.push(
        (target) =>
          target.scope.year === Number(match[1]) &&
          target.scope.courtCode === match[2] &&
          target.scope.bench === match[3],
      );
    }
  }
  if (exact.length) return exact;
  return (parsed.scopes ?? []).map((row) => (target: Target) => {
    if (target.scope.courtCode !== row.court) return false;
    if (row.year !== undefined) return target.scope.year === row.year;
    if (row.fromYear !== undefined && target.scope.year < row.fromYear) return false;
    if (row.toYear !== undefined && target.scope.year > row.toYear) return false;
    return true;
  });
}

function completedUrls(): Set<string> {
  const done = new Set<string>();
  if (!existsSync(JOURNAL)) return done;
  for (const line of readFileSync(JOURNAL, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { sourceUrl?: string; finalState?: FinalState };
      if (row.sourceUrl && row.finalState && row.finalState !== 'ACTIONABLE_FAILURE')
        done.add(row.sourceUrl);
    } catch {
      // A torn final line is replayed. Source URL + append-only observation is
      // still safe because the journal is written only after the DB commit.
    }
  }
  return done;
}

async function targets(sql: Sql): Promise<Target[]> {
  const rows =
    MODE === 'closure'
      ? await sql<Omit<Target, 'scope' | 'basename'>[]>`
        SELECT l.source_url, l.outcome, l.court_code, l.year,
               l.last_attempted_at::text, j.id::text AS judgment_id
          FROM hc_ingest_ledger l
          LEFT JOIN judgments j ON j.source_url = l.source_url
         WHERE l.outcome IN ('no_text','pdf_failed')
         ORDER BY l.outcome, l.source_url`
      : await sql<Omit<Target, 'scope' | 'basename'>[]>`
        SELECT l.source_url, l.outcome, l.court_code, l.year,
               l.last_attempted_at::text, j.id::text AS judgment_id
          FROM hc_ingest_ledger l
          LEFT JOIN judgments j ON j.source_url = l.source_url
         WHERE l.outcome = 'pdf_absent'
         ORDER BY l.last_attempted_at, l.source_url`;

  const changed = changedPredicates();
  const cutoff = Date.now() - REVALIDATE_DAYS * 86_400_000;
  let resolved = rows.map((row) => ({ ...row, ...scopeOf(row.source_url) }));
  if (MODE === 'revalidate') {
    resolved = resolved.filter(
      (row) =>
        Date.parse(row.last_attempted_at) <= cutoff || changed.some((predicate) => predicate(row)),
    );
  }
  const done = APPLY ? completedUrls() : new Set<string>();
  resolved = resolved.filter((row) => !done.has(row.source_url));
  return LIMIT > 0 ? resolved.slice(0, LIMIT) : resolved;
}

async function loadMetadata(targetRows: readonly Target[]): Promise<Map<string, Metadata[]>> {
  const wanted = new Map<string, Set<string>>();
  for (const target of targetRows) {
    const key = scopeKey(target.scope);
    const set = wanted.get(key) ?? new Set<string>();
    set.add(target.basename);
    wanted.set(key, set);
  }
  const result = new Map<string, Metadata[]>();
  const files = (await listMetadataKeys())
    .map((file) => ({ ...file, scope: parsePartitions(file.key) }))
    .filter(
      (file): file is typeof file & { scope: NonNullable<typeof file.scope> } =>
        file.scope !== null,
    )
    .filter((file) => wanted.has(scopeKey(file.scope)));

  for (const file of files) {
    const names = wanted.get(scopeKey(file.scope))!;
    let groups: Array<{ start: number; end: number }>;
    try {
      groups = await withTimeout(
        () => rowGroupRanges(file.key),
        META_TIMEOUT_MS,
        `row groups ${file.key}`,
      );
    } catch (error) {
      process.stderr.write(`[metadata] ${file.key}: ${String(error)}\n`);
      continue;
    }
    for (const group of groups) {
      let rows: Record<string, unknown>[];
      try {
        rows = await withTimeout(
          () =>
            sampleRows<Record<string, unknown>>(
              file.key,
              group.start,
              group.end,
              undefined,
              METADATA_COLUMNS,
            ),
          META_TIMEOUT_MS,
          `metadata ${file.key} ${group.start}-${group.end}`,
        );
      } catch (error) {
        process.stderr.write(`[metadata] ${file.key} @${group.start}: ${String(error)}\n`);
        continue;
      }
      for (const row of rows) {
        const link = typeof row['pdf_link'] === 'string' ? row['pdf_link'] : '';
        const basename = link.split('/').pop() ?? link;
        if (!names.has(basename)) continue;
        const url = pdfUrlFor(file.scope, link);
        const list = result.get(url) ?? [];
        list.push({ row: row as HcMetadataRow, scope: file.scope, sourceKey: file.key });
        result.set(url, list);
      }
    }
  }
  return result;
}

async function fetchPdf(url: string): Promise<{
  response: Response;
  bytes: Uint8Array;
  durationMs: number;
}> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PDF_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'LawMind-R10-HC-closure/1.0' },
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { response, bytes, durationMs: Date.now() - started };
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const isPdf = (bytes: Uint8Array): boolean =>
  bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';

function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause =
    error.cause instanceof Error
      ? `${error.cause.name}: ${error.cause.message}`
      : error.cause === undefined
        ? ''
        : String(error.cause);
  return cause
    ? `${error.name}: ${error.message}; cause=${cause}`
    : `${error.name}: ${error.message}`;
}

async function fetchLedger(
  sql: Sql,
  input: {
    endpoint: string;
    outcome: 'ok' | 'error';
    status?: number;
    durationMs?: number;
    reason?: string;
  },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO official_source_fetch_ledger
      (source, endpoint, outcome, http_status, duration_ms, refusal_reason,
       authorization_basis, conditions_version)
    VALUES
      ('aws_hc', ${input.endpoint}, ${input.outcome}, ${input.status ?? null},
       ${input.durationMs ?? null}, ${input.reason ?? null}, 'aws_open_data', ${CONDITIONS_VERSION})
    RETURNING id`;
  if (!row) throw new Error('official fetch ledger insert returned no id');
  return row.id;
}

async function artifact(
  sql: Sql,
  input: {
    target: Target;
    state: 'verified_judgment' | 'duplicate_linked' | 'fetch_failed' | 'gap_unresolved';
    textState: 'TEXT_AVAILABLE' | 'IMAGE_ONLY_OCR_PENDING' | null;
    bytes: Uint8Array;
    storageKey: string | null;
    metadata: Metadata[];
    note: string;
    fetchLedgerId: string;
    judgmentId?: string | null;
  },
): Promise<void> {
  const boundedRaw =
    input.storageKey === null ? Buffer.from(input.bytes.subarray(0, 16_384)) : null;
  await sql`
    INSERT INTO official_source_artifact
      (source, artifact_role, observation_state, text_state, source_url,
       source_document_key, content_type, payload_sha256, payload_bytes,
       raw_bytes, storage_key, metadata, extraction_note, authorization_basis,
       conditions_version, fetch_ledger_id, judgment_id)
    VALUES
      ('aws_hc', 'judgment_pdf', ${input.state}, ${input.textState}, ${input.target.source_url},
       ${input.target.basename}, 'application/pdf', ${sha256(input.bytes)}, ${input.bytes.byteLength},
       ${boundedRaw}, ${input.storageKey}, ${sql.json({
         ledgerOutcome: input.target.outcome,
         courtCode: input.target.scope.courtCode,
         year: input.target.scope.year,
         bench: input.target.scope.bench,
         metadataCandidates: input.metadata.map((item) => ({
           sourceKey: item.sourceKey,
           row: item.row,
         })),
         lastCheckedAt: new Date().toISOString(),
       })}, ${input.note}, 'aws_open_data', ${CONDITIONS_VERSION}, ${input.fetchLedgerId},
       ${input.judgmentId ?? null})`;
}

async function run(): Promise<void> {
  const sql = postgres(databaseUrl!, {
    max: 4,
    idle_timeout: 30,
    connect_timeout: 60,
    onnotice: () => {},
  });
  const store = objectStoreFromEnv();
  const budget = { counts: zeroCounts(), alerted: false };
  const budgetPolicy = policyFromEnv();
  const startedAt = new Date().toISOString();
  const tally: Record<FinalState, number> = {
    TEXT_READABLE: 0,
    IMAGE_ONLY_OCR_PENDING: 0,
    SOURCE_ARTIFACT_HELD_TEXT_UNAVAILABLE: 0,
    SOURCE_UNAVAILABLE_CURRENT: 0,
    POLICY_REFUSED: 0,
    ACTIONABLE_FAILURE: 0,
  };
  let recoveredPdfFailed = 0;
  let staleHeldLedgerRows = 0;
  let bytesRetained = 0;
  let metadataMissing = 0;
  mkdirSync(dirname(OUT), { recursive: true });
  mkdirSync(dirname(JOURNAL), { recursive: true });
  try {
    const targetRows = await targets(sql);
    const initialPopulation =
      MODE === 'closure'
        ? await sql<{ retry_gap: string; pdf_failed: string; held_overlap: string }[]>`
          SELECT count(*) FILTER (WHERE j.id IS NULL)::text AS retry_gap,
                 count(*) FILTER (WHERE l.outcome='pdf_failed')::text AS pdf_failed,
                 count(*) FILTER (WHERE l.outcome='pdf_failed' AND j.id IS NOT NULL)::text AS held_overlap
            FROM hc_ingest_ledger l LEFT JOIN judgments j ON j.source_url=l.source_url
           WHERE l.outcome IN ('no_text','pdf_failed')`
        : [];
    process.stderr.write(`[closure] mode=${MODE} targets=${targetRows.length} apply=${APPLY}\n`);
    const metadata = await loadMetadata(targetRows);
    if (MODE === 'closure') await warmPdfEngine();

    let completed = 0;
    await mapConcurrent(targetRows, CONCURRENCY, async (target) => {
      let finalState: FinalState = 'ACTIONABLE_FAILURE';
      let detail = '';
      try {
        const fetched = await fetchPdf(target.source_url);
        const livePdf = fetched.response.ok && isPdf(fetched.bytes);
        if (!livePdf) {
          finalState = 'SOURCE_UNAVAILABLE_CURRENT';
          detail = fetched.response.ok
            ? 'soft-404/non-PDF response'
            : `HTTP ${fetched.response.status}`;
          if (APPLY) {
            const ledgerId = await fetchLedger(sql, {
              endpoint: target.source_url,
              outcome: 'error',
              status: fetched.response.status,
              durationMs: fetched.durationMs,
              reason: detail,
            });
            await artifact(sql, {
              target,
              state: 'fetch_failed',
              textState: null,
              bytes: fetched.bytes,
              storageKey: null,
              metadata: metadata.get(target.source_url) ?? [],
              note: `SOURCE_UNAVAILABLE_CURRENT: ${detail}`,
              fetchLedgerId: ledgerId,
            });
            await recordFailures(sql, [
              {
                sourceUrl: target.source_url,
                outcome: 'pdf_absent',
                courtCode: target.scope.courtCode,
                year: target.scope.year,
              },
            ]);
          }
        } else {
          const digest = sha256(fetched.bytes);
          const storageKey = `source-artifacts/aws-hc/sha256/${digest.slice(0, 2)}/${digest}.pdf`;
          if (APPLY) {
            const decision = chargeOperation(budget, 'put', budgetPolicy);
            if (decision.allowed === false) throw new Error(decision.detail);
            // Copy the undici response view into a Node Buffer before handing
            // it to the native-fetch-backed R2 client. Passing the cross-client
            // view directly made native fetch reject its otherwise-correct
            // content-length before sending the request.
            await store.put(storageKey, Buffer.from(fetched.bytes), 'application/pdf');
          }
          bytesRetained += fetched.bytes.byteLength;
          const meta = metadata.get(target.source_url) ?? [];
          if (meta.length === 0) metadataMissing++;
          let textState: 'TEXT_AVAILABLE' | 'IMAGE_ONLY_OCR_PENDING' | null = null;
          let judgmentId = target.judgment_id;
          let observationState: 'verified_judgment' | 'duplicate_linked' = judgmentId
            ? 'duplicate_linked'
            : 'verified_judgment';

          if (target.outcome === 'no_text') {
            textState = 'IMAGE_ONLY_OCR_PENDING';
            finalState = 'IMAGE_ONLY_OCR_PENDING';
            detail = 'existing canonical no_text outcome; raw PDF retained; OCR not run';
          } else if (judgmentId) {
            textState = 'TEXT_AVAILABLE';
            finalState = 'TEXT_READABLE';
            detail = 'stale pdf_failed ledger row already has canonical judgment';
            staleHeldLedgerRows++;
            recoveredPdfFailed++;
          } else {
            try {
              const extracted = await withTimeout(
                () => extractPdfBytes(fetched.bytes.slice(), target.source_url),
                PDF_TIMEOUT_MS,
                target.source_url,
              );
              if (
                !isNativeText(extracted.text.length, extracted.pages) ||
                extracted.text.trim() === ''
              ) {
                textState = 'IMAGE_ONLY_OCR_PENDING';
                finalState = 'IMAGE_ONLY_OCR_PENDING';
                detail = 'canonical extraction found no usable text layer; OCR not run';
              } else {
                textState = 'TEXT_AVAILABLE';
                const chosen = meta[0];
                if (!chosen) {
                  finalState = 'SOURCE_ARTIFACT_HELD_TEXT_UNAVAILABLE';
                  detail = 'text extracted but canonical metadata row was not recovered';
                } else {
                  const mapped = toJudgmentRecord(
                    chosen.row,
                    chosen.scope,
                    extracted.text,
                    target.source_url,
                    true,
                    extracted.method,
                  );
                  if (mapped.ok === false) {
                    finalState = 'SOURCE_ARTIFACT_HELD_TEXT_UNAVAILABLE';
                    detail = `canonical mapper refused metadata: ${mapped.reason}`;
                  } else {
                    if (APPLY) {
                      await upsertJudgments(sql, [mapped.record]);
                      const [row] = await sql<{ id: string }[]>`
                        SELECT id::text FROM judgments WHERE source_url=${target.source_url}`;
                      judgmentId = row?.id ?? null;
                      if (!judgmentId) throw new Error('canonical upsert returned no judgment row');
                    }
                    finalState = 'TEXT_READABLE';
                    detail = 'recovered through canonical extract/map/upsert path';
                    recoveredPdfFailed++;
                  }
                }
              }
            } catch (error) {
              finalState = 'SOURCE_ARTIFACT_HELD_TEXT_UNAVAILABLE';
              detail = `raw PDF retained; canonical extraction unavailable: ${errorDetail(error)}`;
            }
          }

          if (APPLY) {
            const ledgerId = await fetchLedger(sql, {
              endpoint: target.source_url,
              outcome: 'ok',
              status: fetched.response.status,
              durationMs: fetched.durationMs,
            });
            await artifact(sql, {
              target,
              state: observationState,
              textState,
              bytes: fetched.bytes,
              storageKey,
              metadata: meta,
              note: detail,
              fetchLedgerId: ledgerId,
              judgmentId,
            });
            await clearSucceeded(sql, [target.source_url]);
          }
        }
      } catch (error) {
        finalState = 'ACTIONABLE_FAILURE';
        detail = errorDetail(error);
        if (APPLY) {
          const empty = new Uint8Array();
          const ledgerId = await fetchLedger(sql, {
            endpoint: target.source_url,
            outcome: 'error',
            reason: detail,
          });
          await artifact(sql, {
            target,
            state: 'gap_unresolved',
            textState: null,
            bytes: empty,
            storageKey: null,
            metadata: metadata.get(target.source_url) ?? [],
            note: `ACTIONABLE_FAILURE: ${detail}`,
            fetchLedgerId: ledgerId,
          });
        }
      }

      tally[finalState]++;
      completed++;
      if (APPLY) {
        appendFileSync(
          JOURNAL,
          `${JSON.stringify({
            sourceUrl: target.source_url,
            priorOutcome: target.outcome,
            finalState,
            detail,
            at: new Date().toISOString(),
          })}\n`,
        );
      }
      if (completed % 250 === 0 || completed === targetRows.length) {
        process.stderr.write(
          `[closure] ${completed}/${targetRows.length} ${JSON.stringify(tally)}\n`,
        );
      }
    });

    const artifactSummary = {
      artifact: 'NEW2_HC_GAP_CLOSURE_R10',
      mode: MODE,
      apply: APPLY,
      definitionVersion: 'HC_PARITY_V2_2026-08-29',
      startedAt,
      completedAt: new Date().toISOString(),
      input: {
        selectedThisRun: targetRows.length,
        ...(initialPopulation[0]
          ? {
              retryExhaustedNotHeld: Number(initialPopulation[0].retry_gap),
              pdfFailedCompletePopulation: Number(initialPopulation[0].pdf_failed),
              pdfFailedAlreadyHeldOverlap: Number(initialPopulation[0].held_overlap),
            }
          : {}),
        revalidationWindowDays: REVALIDATE_DAYS,
        changedScopesArtifact: CHANGED_SCOPES.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
      },
      results: {
        ...tally,
        recoveredPdfFailed,
        staleHeldLedgerRowsCleared: staleHeldLedgerRows,
        metadataMissing,
        bytesRetained,
        r2Operations: budget.counts,
      },
      journal: JOURNAL.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
      noOcrRun: true,
    };
    writeFileSync(OUT, `${JSON.stringify(artifactSummary, null, 2)}\n`);
    console.log(JSON.stringify(artifactSummary));
  } finally {
    await sql.end({ timeout: 15 });
  }
}

await run();
