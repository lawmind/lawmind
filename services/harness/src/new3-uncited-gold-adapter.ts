/**
 * NEW1 — read NEW3's uncited-authority gold into the leakage contract.
 *
 * WHY THIS SET MATTERS MORE THAN ITS SIZE SUGGESTS
 * -----------------------------------------------
 * Every gold set either lane has built until now selects authorities by CITATION
 * EDGE, so every one of them has `MIN_INBOUND >= 1` and none can say anything
 * about an authority nobody has cited. That blind spot was reported from this
 * lane as a caveat (0831, 0834) and NEW3 answered it: 26 judgments drawn from
 * LCC's holdings, 1,547 of whose 1,553 source judgments have ZERO inbound
 * citations verified live. It is 26 rows and it is the only instrument we have
 * for the majority case.
 *
 * WHY EVERY NUMBER IT PRODUCES IS AN UPPER BOUND
 * ----------------------------------------------
 * With no citing judgment there is no independent passage to lift, so the query
 * has to be the judgment's OWN extracted holding. That is not leakage in the
 * sense the reranker experiment was — the document vector covers `HEAD:4800` and
 * a holding often sits well past that — but it is the easiest possible query for
 * that document, and a success rate from it is not the rate a paraphrase would
 * get.
 *
 * The contract expresses that rather than hiding it: `own_text_span` PROHIBITS
 * `sparse_lexical` outright, because a term-overlap score against a verbatim copy
 * is measuring the copy, and it CAUTIONS `dense_similarity`, which a report must
 * print alongside the figure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
import type { EvalRow } from './gold-contract.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type UncitedCase = {
  query_id: string;
  gold_provenance_type: string;
  generated: boolean;
  authority_id: string;
  court: string;
  year: number;
  query: string;
  primary_evidence?: string;
};

export type LoadedUncited = {
  rows: EvalRow[];
  dropped: { queryId: string; reason: string; detail: string }[];
  courts: string[];
};

// Matching mojibake IS the job here: these are the bytes a legacy-font PDF leaves
// behind, and the lint rule exists to stop them entering a regex by accident
// rather than on purpose.
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');
const CONTROL_LIMIT = 5;

export function loadUncitedGold(path = 'docs/ai/new3-uncited-authority-gold.json'): LoadedUncited {
  const resolved = isAbsolute(path) ? path : join(ROOT, path);
  const file = JSON.parse(readFileSync(resolved, 'utf8')) as { cases: UncitedCase[] };

  const rows: EvalRow[] = [];
  const dropped: LoadedUncited['dropped'] = [];
  for (const c of file.cases) {
    const control = (c.query.match(CONTROL) ?? []).length;
    if (control >= CONTROL_LIMIT) {
      dropped.push({
        queryId: c.query_id,
        reason: 'control_characters',
        detail: `${control} control characters`,
      });
      continue;
    }
    // `generated: true` would mean a model wrote the query. None are today, and
    // the check is here so that a later cut which adds them cannot enter the
    // contract silently under a provenance that assumes verbatim text.
    if (c.generated) {
      dropped.push({
        queryId: c.query_id,
        reason: 'model_generated',
        detail: 'query was not lifted verbatim',
      });
      continue;
    }
    rows.push({
      queryId: c.query_id,
      queryType: 'uncited_holding',
      query: c.query,
      goldAuthorityId: c.authority_id,
      goldProvenanceType: 'legal_object_claim',
      queryConstruction: 'own_text_span',
      goldEvidence: {
        method: c.gold_provenance_type,
        court: c.court,
        year: c.year,
        primaryEvidence: c.primary_evidence ?? null,
        inboundCitations: 0,
      },
      // The authority is its own family. One row per authority here, but stated
      // rather than left implicit so a later cut with several holdings per
      // judgment still splits correctly.
      caseFamily: c.authority_id,
    });
  }
  return { rows, dropped, courts: [...new Set(file.cases.map((c) => c.court))].sort() };
}
