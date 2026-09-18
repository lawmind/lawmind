/**
 * Provenance-rich training / evaluation datasets, exported as JSONL.
 *
 *   pnpm --filter @lawmind/ingest dataset:export -- --set <name> [--limit N] [--out DIR]
 *   pnpm --filter @lawmind/ingest dataset:export -- --set all
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY FILES AND NOT TABLES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The brief is explicit that these stay "separate from canonical legal tables",
 * and a table in the same database is not separate in the way that matters: the
 * next agent writes a join, the join works, and a training artefact has silently
 * become something the product reads. A JSONL file on disk cannot be joined to
 * by accident.
 *
 * It is also the honest shape for the thing. A dataset is a SNAPSHOT — it is
 * cut, versioned, and trained against. A live table would drift under the
 * experiment that used it, and then "which rows did that run see" is
 * unanswerable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS ALLOWED IN, AND WHAT IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Only claims whose evidence span was located in the source text.** A
 * `partial` enrichment contributes its verified claims and drops its rejected
 * ones; a `rejected` enrichment contributes nothing. Training on a model's
 * unverified output is how a fabrication becomes a learned habit, and
 * `CLAUDE.md` already forbids training on a model's commentary about law —
 * this is the mechanical enforcement of that rule rather than a promise to
 * remember it.
 *
 * Every row therefore carries, per the brief: `document_id`, the exact
 * `source_span`, `model`, `prompt_version`, and `verification_status`. A row
 * with no span does not exist, because `verifyClaims` is what put it here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPLIT IS BY DOCUMENT, NOT BY ROW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One judgment yields many claims. Splitting rows at random puts the facts of a
 * case in train and its holding in eval, and the evaluation then measures
 * memorisation of a document the model has already seen. The split is a hash of
 * the JUDGMENT id, so a document is wholly in one side or wholly in the other.
 */
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { sha256 } from './enrich.ts';
import { installCrashGuard } from './crash-guard.ts';
import { openDb } from './db-host.ts';

installCrashGuard('dataset-export');

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const SET = arg('set', 'all');
const LIMIT = Number(arg('limit', '50000'));
const OUT = arg('out', join('datasets', new Date().toISOString().slice(0, 10)));

/** `eval` is one document in ten, chosen by hash so a re-export is identical. */
function splitOf(judgmentId: string): 'train' | 'eval' {
  return parseInt(sha256(judgmentId).slice(0, 8), 16) % 10 === 0 ? 'eval' : 'train';
}

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = await openDb(dbUrl, 3);

mkdirSync(OUT, { recursive: true });

type Row = Record<string, unknown> & { judgment_id: string };

const counts = new Map<string, { train: number; eval: number }>();

function emit(dataset: string, row: Row): void {
  const split = splitOf(row.judgment_id);
  appendFileSync(join(OUT, `${dataset}.${split}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8');
  const c = counts.get(dataset) ?? { train: 0, eval: 0 };
  c[split]++;
  counts.set(dataset, c);
}

function reset(dataset: string): void {
  for (const split of ['train', 'eval']) {
    rmSync(join(OUT, `${dataset}.${split}.jsonl`), { force: true });
  }
}

/* ------------------------------------------------- case intelligence ------ */

/**
 * document → issues · facts · holding · reasoning · evidence.
 *
 * Drawn from the five 0051 legal-object tasks. `parsed_output.claims[]` already
 * carries each claim's own `verified` flag and rejection reason, written by
 * `verifyClaims` at the time of the call, so the filter here is a read of a
 * recorded verdict rather than a re-judgement of it.
 */
async function exportCaseIntelligence(): Promise<void> {
  reset('case_intelligence');
  const rows = await sql<
    {
      judgmentId: string;
      caseTitle: string | null;
      court: string | null;
      judgmentDate: string | null;
      task: string;
      model: string;
      promptVersion: string;
      verificationState: string;
      parsedOutput: {
        claims?: {
          value: string;
          kind: string;
          verified: boolean;
          extra?: Record<string, unknown>;
        }[];
      } | null;
    }[]
  >`
    SELECT e.judgment_id AS "judgmentId", j.case_title AS "caseTitle", j.court,
           j.judgment_date::text AS "judgmentDate",
           e.task, e.model, e.prompt_version AS "promptVersion",
           e.verification_state AS "verificationState", e.parsed_output AS "parsedOutput"
    FROM document_enrichments e
    JOIN judgments j ON j.id = e.judgment_id
    WHERE e.status = 'ok'
      AND e.task IN ('case_structure', 'holding', 'arguments', 'authorities', 'topics')
      AND e.verification_state IN ('verified', 'partial')
    ORDER BY e.created_at DESC
    LIMIT ${LIMIT}`;

  for (const r of rows) {
    for (const claim of r.parsedOutput?.claims ?? []) {
      // The one filter that matters. A rejected claim is a fabrication that was
      // caught; putting it in a training set would teach the fabrication.
      if (!claim.verified) continue;
      emit('case_intelligence', {
        judgment_id: r.judgmentId,
        document_id: r.judgmentId,
        case_title: r.caseTitle,
        court: r.court,
        judgment_date: r.judgmentDate,
        field: claim.kind,
        // The span IS the content here — these tasks quote rather than summarise.
        source_span: claim.value,
        // The model's own gloss. Carried so a reader can see what it thought the
        // span meant, and labelled so nobody mistakes it for a verified fact.
        model_label_unverified: claim.extra?.['label'] ?? null,
        model_extra_unverified: claim.extra ?? null,
        task: r.task,
        model: r.model,
        prompt_version: r.promptVersion,
        verification_status: 'verified',
        document_verification_state: r.verificationState,
        provenance: 'document_enrichments',
      });
    }
  }
}

/* --------------------------------------------------------- treatment ------ */

/**
 * case A → treatment → case B → evidence.
 *
 * DETERMINISTIC, not model-derived: these edges come from `citations.ts`'s
 * `detectTreatment`, which matches the court's own annotation near a citation.
 * `evidence` is the matched span. Rows with no evidence are excluded — a
 * treatment nobody can point at is exactly the kind of label that trains a
 * model to assert one.
 */
async function exportTreatment(): Promise<void> {
  reset('treatment');
  const rows = await sql<
    {
      judgmentId: string;
      citingTitle: string | null;
      citedJudgmentId: string;
      citedTitle: string | null;
      relationship: string;
      evidence: string;
      citationText: string;
    }[]
  >`
    SELECT jc.citing_judgment_id AS "judgmentId", cj.case_title AS "citingTitle",
           jc.cited_judgment_id AS "citedJudgmentId", tj.case_title AS "citedTitle",
           jc.relationship, jc.evidence, jc.citation_text AS "citationText"
    FROM judgment_citations jc
    JOIN judgments cj ON cj.id = jc.citing_judgment_id
    JOIN judgments tj ON tj.id = jc.cited_judgment_id
    WHERE jc.cited_judgment_id IS NOT NULL
      AND jc.relationship <> 'cites'
      AND jc.evidence IS NOT NULL AND length(jc.evidence) > 0
    LIMIT ${LIMIT}`;

  for (const r of rows) {
    emit('treatment', {
      judgment_id: r.judgmentId,
      document_id: r.judgmentId,
      citing_case: r.citingTitle,
      cited_judgment_id: r.citedJudgmentId,
      cited_case: r.citedTitle,
      citation_text: r.citationText,
      treatment: r.relationship,
      source_span: r.evidence,
      model: null,
      prompt_version: null,
      verification_status: 'deterministic',
      provenance: 'judgment_citations.detectTreatment',
    });
  }
}

/* ---------------------------------------------------------- citation ------ */

/**
 * citation → canonical authority.
 *
 * Only edges the deterministic resolver actually joined to a judgment we hold.
 * An unresolved citation is not a negative example — it is a citation to
 * something outside the corpus, and labelling it "no such authority" would
 * teach exactly the wrong thing.
 */
async function exportCitation(): Promise<void> {
  reset('citation');
  const rows = await sql<
    {
      judgmentId: string;
      citationText: string;
      normalised: string;
      citedJudgmentId: string;
      citedTitle: string | null;
      citedNeutral: string | null;
    }[]
  >`
    SELECT jc.citing_judgment_id AS "judgmentId", jc.citation_text AS "citationText",
           jc.normalised_citation AS "normalised", jc.cited_judgment_id AS "citedJudgmentId",
           tj.case_title AS "citedTitle", tj.neutral_citation AS "citedNeutral"
    FROM judgment_citations jc
    JOIN judgments tj ON tj.id = jc.cited_judgment_id
    WHERE jc.cited_judgment_id IS NOT NULL AND jc.citation_text <> ''
    LIMIT ${LIMIT}`;

  for (const r of rows) {
    emit('citation', {
      judgment_id: r.judgmentId,
      document_id: r.judgmentId,
      citation_as_printed: r.citationText,
      citation_normalised: r.normalised,
      resolves_to_judgment_id: r.citedJudgmentId,
      resolves_to_case: r.citedTitle,
      resolves_to_neutral_citation: r.citedNeutral,
      model: null,
      prompt_version: null,
      verification_status: 'deterministic',
      provenance: 'judgment_citations.buildIndex',
    });
  }
}

/* --------------------------------------------------------- retrieval ------ */

/**
 * query → authority → passage.
 *
 * The query side comes from the `topics` task's `search_concepts`: what an
 * advocate would type, produced by the model but ANCHORED to a verified span in
 * the judgment it is meant to retrieve. So the pair is (model-written query,
 * verified passage) — the query is a hypothesis and is labelled as one, while
 * the passage it points at is real text from a real document.
 */
async function exportRetrieval(): Promise<void> {
  reset('retrieval');
  const rows = await sql<
    {
      judgmentId: string;
      caseTitle: string | null;
      court: string | null;
      model: string;
      promptVersion: string;
      parsedOutput: {
        claims?: {
          value: string;
          kind: string;
          verified: boolean;
          extra?: Record<string, unknown>;
        }[];
      } | null;
    }[]
  >`
    SELECT e.judgment_id AS "judgmentId", j.case_title AS "caseTitle", j.court,
           e.model, e.prompt_version AS "promptVersion", e.parsed_output AS "parsedOutput"
    FROM document_enrichments e
    JOIN judgments j ON j.id = e.judgment_id
    WHERE e.status = 'ok' AND e.task = 'topics'
      AND e.verification_state IN ('verified', 'partial')
    ORDER BY e.created_at DESC
    LIMIT ${LIMIT}`;

  for (const r of rows) {
    for (const claim of r.parsedOutput?.claims ?? []) {
      if (!claim.verified) continue;
      if (claim.kind !== 'search_concept' && claim.kind !== 'topic') continue;
      const query = claim.extra?.['label'];
      if (typeof query !== 'string' || query.trim() === '') continue;
      emit('retrieval', {
        judgment_id: r.judgmentId,
        document_id: r.judgmentId,
        // Model-written and NOT verifiable against the text by construction —
        // it is a query, not a quotation. Named so in the field itself.
        query_unverified: query,
        query_kind: claim.kind,
        authority_judgment_id: r.judgmentId,
        authority_case: r.caseTitle,
        court: r.court,
        source_span: claim.value,
        model: r.model,
        prompt_version: r.promptVersion,
        // The SPAN is verified; the QUERY is the model's proposal about it.
        verification_status: 'span_verified_query_unverified',
        provenance: 'document_enrichments.topics',
      });
    }
  }
}

/* ----------------------------------------------------------- statute ------ */

/**
 * provision → version → amendment → effective date.
 *
 * Entirely deterministic, parsed from official sources by
 * `statute-amendments.ts`. No model touches this set, which is why it is the
 * one that could ever be treated as ground truth.
 */
async function exportStatute(): Promise<void> {
  reset('statute');
  const rows = await sql<
    {
      rowKey: string;
      actTitle: string | null;
      actYear: number | null;
      sectionNumber: string | null;
      heading: string | null;
      eventType: string | null;
      amendingActRaw: string | null;
      amendingActNumber: string | null;
      amendingActYear: number | null;
      effectiveDate: string | null;
      substitutedText: string | null;
      verbatim: string | null;
    }[]
  >`
    SELECT a.id::text AS "rowKey", s.short_title AS "actTitle", s.act_year AS "actYear",
           sec.section_number AS "sectionNumber", sec.heading,
           a.event_type AS "eventType", a.amending_act_raw AS "amendingActRaw",
           a.amending_act_number AS "amendingActNumber", a.amending_act_year AS "amendingActYear",
           a.effective_date::text AS "effectiveDate",
           a.substituted_text AS "substitutedText", a.verbatim
    FROM statute_amendments a
    JOIN statute_sections sec ON sec.id = a.statute_section_id
    JOIN statutes s ON s.id = sec.statute_id
    ORDER BY a.id
    LIMIT ${LIMIT}`;

  for (const r of rows) {
    emit('statute', {
      // Not a judgment; the split still needs a stable per-row key, and the
      // amendment id is the only thing that is one.
      judgment_id: r.rowKey,
      document_id: r.rowKey,
      act: r.actTitle,
      act_year: r.actYear,
      section: r.sectionNumber,
      section_heading: r.heading,
      event_type: r.eventType,
      amended_by: r.amendingActRaw,
      amending_act_number: r.amendingActNumber,
      amending_act_year: r.amendingActYear,
      effective_date: r.effectiveDate,
      substituted_text: r.substitutedText,
      // The footnote the amendment was parsed out of. This is the statute set's
      // equivalent of a source span: the official text that says so.
      source_span: r.verbatim,
      model: null,
      prompt_version: null,
      verification_status: 'deterministic',
      provenance: 'statute_amendments (official source, parsed)',
    });
  }
}

/* ---------------------------------------------------------------- run ----- */

const EXPORTS: Record<string, () => Promise<void>> = {
  case_intelligence: exportCaseIntelligence,
  treatment: exportTreatment,
  citation: exportCitation,
  retrieval: exportRetrieval,
  statute: exportStatute,
};

const chosen = SET === 'all' ? Object.keys(EXPORTS) : [SET];
for (const name of chosen) {
  const fn = EXPORTS[name];
  if (!fn) {
    console.error(`--set must be one of ${Object.keys(EXPORTS).join(', ')} or all`);
    process.exit(2);
  }
}

console.log('DATASET EXPORT');
console.log('='.repeat(74));
console.log(`out ${OUT} · sets ${chosen.join(', ')} · cap ${LIMIT.toLocaleString()} rows per set`);
console.log('');

for (const name of chosen) {
  const started = Date.now();
  await EXPORTS[name]!();
  const c = counts.get(name) ?? { train: 0, eval: 0 };
  const total = c.train + c.eval;
  console.log(
    `${name.padEnd(20)} ${String(total).padStart(8)} rows · train ${c.train} / eval ${c.eval}` +
      ` · ${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
  // A set that produced nothing is REPORTED, never quietly absent. An empty
  // dataset file and a missing one look identical to whoever trains next.
  if (total === 0)
    console.log(`${''.padEnd(20)} ^ EMPTY — no rows met this set's verification bar`);
}

console.log('');
console.log('Split is by document hash, one in ten to eval, so a re-export is identical');
console.log('and no document appears on both sides.');
await sql.end();
process.exit(0);
