/**
 * NEW1 — read NEW3's semantic-expansion gold into the leakage contract.
 *
 * The gold file is a good artefact and this is not a rewrite of it. It is the
 * translation layer that makes each row carry, mechanically, what
 * `gold-contract.ts` needs in order to refuse a leaking feature: how the
 * authority came to be gold, how the query text was produced, and which family
 * the row belongs to.
 *
 * It also DROPS rows, with a recorded reason, and reports what it dropped. Two
 * defects were found by reading the file before scoring anything with it:
 *
 *   · 22 of 250 distinct citation edges are chronologically impossible — the
 *     CITED judgment is dated after the citing one. Chased to ground on the first:
 *     the cited judgment's own neutral citation says 2025 and its `judgment_date`
 *     says 2026-01-12, so the EDGE is right and the DATE is wrong. That makes it
 *     ingest metadata, not gold construction, but the pairing cannot be scored
 *     until somebody fixes the field.
 *   · one row of 750 is legacy-font mojibake, 151 control characters mid-passage.
 *     One row is not a failure of NEW3's OCR screen and is not reported as one.
 *
 * Dropping is DEFAULT-ON and countable. A silent drop and a silent pass look the
 * same in a metric, and this lane has already published one number that was really
 * about how its gold was built.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';

/**
 * Gold paths are REPO-relative, resolved here rather than in each caller.
 *
 * The harness runs from  under pnpm and from the repo root by
 * hand, and every caller that resolved the path itself got it wrong for one of
 * the two. Doing it in the loader means a caller can pass what a person would
 * type and an absolute path still works untouched, which the tests rely on.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
import type { EvalRow, GoldProvenanceType, QueryConstruction } from './gold-contract.ts';

type New3Provenance = {
  method: string;
  citingJudgmentId: string;
  citingCase: string;
  citingCourt: string;
  citingDate: string;
  citedCase: string;
  citedCourt: string;
  citedDate: string;
  inboundCitations: number;
  redacted?: string[];
  tag: string;
};

type New3Row = {
  id: string;
  queryType: 'proposition' | 'exact_citation' | 'case_title';
  query: string;
  goldJudgmentId: string;
  relationship: string;
  provenance: New3Provenance;
};

export type DropReason = 'cited_after_citing' | 'control_characters' | 'unknown_query_type';

export type LoadedGold = {
  rows: EvalRow[];
  dropped: { queryId: string; reason: DropReason; detail: string }[];
  /** Counts BEFORE dropping, so a shrinking gold set is visible rather than inferred. */
  totals: { rowsInFile: number; distinctAuthorities: number; distinctEdges: number };
};

/**
 * Control characters that no legal text contains. Tab, newline and carriage
 * return are deliberately NOT here: they are formatting, and a passage containing
 * one is fine.
 */
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');
/**
 * Five, not one. A single stray byte in a 900-character passage does not make it
 * unreadable, and a threshold of one would drop rows for a defect that changes no
 * outcome. 151 — the one row that actually fails — is not near this boundary.
 */
const CONTROL_LIMIT = 5;

const PROVENANCE_BY_TYPE: Record<New3Row['queryType'], { provenance: GoldProvenanceType; construction: QueryConstruction }> = {
  // The target's citation string and title words are removed by NEW3 before the
  // passage is emitted — `provenance.redacted` lists exactly what went.
  proposition: { provenance: 'citation_edge', construction: 'redacted_passage' },
  exact_citation: { provenance: 'own_citation_string', construction: 'own_identifier' },
  case_title: { provenance: 'own_case_title', construction: 'own_identifier' },
};

export function loadNew3Gold(
  path: string,
  opts: { dropChronologyDefects?: boolean; dropControlCharacters?: boolean } = {},
): LoadedGold {
  const dropChronology = opts.dropChronologyDefects ?? true;
  const dropControl = opts.dropControlCharacters ?? true;

  const resolved = isAbsolute(path) ? path : join(ROOT, path);
  const file = JSON.parse(readFileSync(resolved, 'utf8')) as { rows: New3Row[] };
  const rows: EvalRow[] = [];
  const dropped: LoadedGold['dropped'] = [];
  const edges = new Set<string>();
  const authorities = new Set<string>();

  for (const r of file.rows) {
    authorities.add(r.goldJudgmentId);
    edges.add(`${r.goldJudgmentId}|${r.provenance.citingJudgmentId}`);

    const mapping = PROVENANCE_BY_TYPE[r.queryType];
    if (!mapping) {
      dropped.push({ queryId: r.id, reason: 'unknown_query_type', detail: String(r.queryType) });
      continue;
    }

    const control = (r.query.match(CONTROL) ?? []).length;
    if (dropControl && control >= CONTROL_LIMIT) {
      dropped.push({ queryId: r.id, reason: 'control_characters', detail: `${control} control characters` });
      continue;
    }

    const cited = Date.parse(r.provenance.citedDate);
    const citing = Date.parse(r.provenance.citingDate);
    if (dropChronology && Number.isFinite(cited) && Number.isFinite(citing) && cited > citing) {
      dropped.push({
        queryId: r.id,
        reason: 'cited_after_citing',
        detail: `cited ${r.provenance.citedDate} > citing ${r.provenance.citingDate}`,
      });
      continue;
    }

    rows.push({
      queryId: r.id,
      queryType: r.queryType,
      query: r.query,
      goldAuthorityId: r.goldJudgmentId,
      goldProvenanceType: mapping.provenance,
      queryConstruction: mapping.construction,
      goldEvidence: { ...r.provenance, relationship: r.relationship },
      // The AUTHORITY is the family. Its proposition, its citation string and its
      // title are three views of one thing and must never be split across a
      // train/test boundary.
      caseFamily: r.goldJudgmentId,
    });
  }

  return {
    rows,
    dropped,
    totals: { rowsInFile: file.rows.length, distinctAuthorities: authorities.size, distinctEdges: edges.size },
  };
}
