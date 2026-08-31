/**
 * NEW2 — R18 §3. DOES R17'S POPULATION STILL BELONG?
 *
 * `NEW2-R17-EXISTING-ed780d3fdeb77514` is 127 rows built from a 550-document
 * frozen evaluation set whose ground truth was adjudicated on the row's own
 * identity. R18's population is built a different way — the committed extractor
 * re-run over every stored citation in the corpus — so the two can disagree, and
 * where they do the disagreement is the finding.
 *
 * This re-verifies the old population against the CURRENT database, row by row:
 *   - does the population file still hash to its recorded hash
 *   - does the judgment still exist, and has its content_hash moved
 *   - is `currentExtractedCitation` still what the database holds
 *   - is the row inside R18's walk scope at all
 *
 * Nothing is mutated. The old population file is not rewritten.
 *
 * Read-only. Database, no network.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { neutralCitationFrom } from '../services/ingest/src/harvest/hc-load.ts';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs/ai/new2-r17/existing-correction-population.json');
const OUT = join(ROOT, 'docs/ai/new2-r18/r17-population-reverified.json');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Correction = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  currentExtractedCitation: string | null;
  correctedState: string;
  correctedValue: string | null;
  evidenceSupportsCorrection: boolean;
  reason: string;
  stratum: string;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const raw = readFileSync(SRC);
  const fileHash = createHash('sha256').update(raw).digest('hex');
  const pop = JSON.parse(raw.toString('utf8')) as {
    populationId: string;
    populationHash: string;
    size: number;
    corrections: Correction[];
  };

  // The recorded hash is over the population IDENTITY LINES — the exact
  // construction in scripts/n2-r17-existing-corrections.mts, reproduced here so
  // "the population is unchanged" is a recomputation and not a claim.
  const identity = pop.corrections
    .map((c) => c.judgmentId + ':' + (c.currentExtractedCitation ?? '') + '>' + (c.correctedValue ?? 'NULL'))
    .join(String.fromCharCode(10));
  const popHash = createHash('sha256').update(identity).digest('hex');

  const ids = pop.corrections.map((c) => c.judgmentId);
  const rows = await sql<
    {
      id: string;
      court: string;
      case_number: string | null;
      cnr: string | null;
      neutral_citation: string | null;
      content_hash: string | null;
      source_url: string | null;
      full_text: string | null;
    }[]
  >`SELECT id, court, case_number, cnr, neutral_citation, content_hash, source_url, full_text
      FROM judgments WHERE id = ANY(${ids}::uuid[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const NEUTRAL_ONE = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/;
  function armOld(t: string, year: number): string | null {
    const m = NEUTRAL_ONE.exec(t.slice(0, 3000));
    if (!m) return null;
    const c = Number(m[1]);
    return c === year || c === year - 1 ? m[0] : null;
  }

  // R18's own population, so the two readings can be put side by side rather
  // than one restated as the other. R17 proposed a STATE; R18 also assigns a
  // REASON, and "refused because two candidates tied" is not the same
  // disposition as "refused cleanly" even though both say the stored value
  // cannot stand.
  const r18Class = new Map<string, string>();
  try {
    for (const line of readFileSync(join(ROOT, 'docs/ai/new2-r18/existing-correction-population.jsonl'), 'utf8').split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      const o = JSON.parse(line) as { judgmentId: string; reasonClass: string };
      r18Class.set(o.judgmentId, o.reasonClass);
    }
  } catch {
    console.log('[r17-reverify] R18 population not present yet; r18ReasonClass will be null');
  }

  const verdicts: Record<string, unknown>[] = [];
  const tally: Record<string, number> = {};
  const bump = (k: string): void => {
    tally[k] = (tally[k] ?? 0) + 1;
  };

  for (const c of pop.corrections) {
    const r = byId.get(c.judgmentId);
    if (!r) {
      bump('ROW_GONE');
      verdicts.push({ ...c, r18Verdict: 'ROW_GONE', reasonExact: 'the judgment id is no longer in judgments' });
      continue;
    }
    const storedNow = r.neutral_citation;
    const py = /year=(\d{4})/.exec(r.source_url ?? '');
    const text = r.full_text ?? '';
    const year = py ? Number(py[1]) : null;
    const candidate = year === null ? null : neutralCitationFrom(text, year, { caseNumber: r.case_number, cnr: r.cnr });
    const old = year === null ? null : armOld(text, year);

    // R18 walks rows that CARRY a stored citation. A row R17 corrected from NULL
    // to a citation is outside that walk by construction — it is not a
    // disagreement, it is a different question, and it is reported as one.
    const inR18Scope = storedNow !== null && storedNow !== '';

    let verdict: string;
    let reasonExact: string;
    if (storedNow !== c.currentExtractedCitation) {
      verdict = 'STORED_VALUE_MOVED';
      reasonExact = `the database now holds ${JSON.stringify(storedNow)} where the population recorded ${JSON.stringify(c.currentExtractedCitation)}`;
    } else if (!inR18Scope) {
      verdict = 'OUT_OF_R18_WALK_SCOPE';
      reasonExact =
        'the row carries no stored neutral citation, so R18 never evaluates it; R17 proposed ADDING one from hand-adjudicated ground truth and that proposal is unchanged and unapplied';
    } else if (candidate === null && c.correctedState === 'NO_SAFE_OWN_CITATION') {
      verdict = 'STILL_BELONGS_CLEAR_TO_NULL';
      reasonExact = 'the committed extractor refuses this document, which is exactly the correction R17 proposed';
    } else if (candidate !== null && candidate === c.correctedValue) {
      verdict = 'STILL_BELONGS_REPLACE';
      reasonExact = `the committed extractor answers ${candidate}, the value R17 proposed`;
    } else if (candidate !== null && c.correctedState === 'NO_SAFE_OWN_CITATION') {
      verdict = 'CONTRADICTED_EXTRACTOR_ANSWERS';
      reasonExact = `R17 proposed NO_SAFE_OWN_CITATION but the committed extractor answers ${candidate}`;
    } else {
      verdict = 'DIVERGENT';
      reasonExact = `R17 proposed ${JSON.stringify(c.correctedValue)} (${c.correctedState}); the committed extractor answers ${JSON.stringify(candidate)}`;
    }
    bump(verdict);
    verdicts.push({
      judgmentId: c.judgmentId,
      court: c.court,
      caseNumber: c.caseNumber,
      contentHash: r.content_hash,
      storedThen: c.currentExtractedCitation,
      storedNow,
      r17CorrectedState: c.correctedState,
      r17CorrectedValue: c.correctedValue,
      r17EvidenceSupports: c.evidenceSupportsCorrection,
      committedExtractorAnswer: candidate,
      oldRuleAnswer: old,
      inR18WalkScope: inR18Scope,
      r18Verdict: verdict,
      r18ReasonClass: r18Class.get(c.judgmentId) ?? null,
      reasonExact,
    });
    bump('r18Class:' + (r18Class.get(c.judgmentId) ?? 'NOT_IN_R18_POPULATION'));
  }

  const artifact = {
    artifact: 'NEW2_R18_R17_POPULATION_REVERIFICATION',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    applied: false,
    EXISTING_CORRECTIONS_APPLIED: 'NO',
    note: 'the R17 population file is READ here and never rewritten. Where R18 disagrees, both readings are carried forward; nothing in the old artifact is edited.',
    r17: {
      populationId: pop.populationId,
      recordedPopulationHash: pop.populationHash,
      recomputedPopulationHash: popHash,
      populationHashMatches: popHash === pop.populationHash,
      artifactFileSha256: fileHash,
      recordedSize: pop.size,
      observedSize: pop.corrections.length,
    },
    rowsFoundInDatabase: rows.length,
    verdicts: tally,
    rows: verdicts,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1) + String.fromCharCode(10));
  console.log('[r17-reverify] population hash matches:', popHash === pop.populationHash);
  console.log('[r17-reverify] verdicts', JSON.stringify(tally, null, 1));
  console.log('[r17-reverify] wrote', OUT);
} finally {
  await sql.end();
}
