/**
 * NEW2 — R19 §2/§3. ADJUDICATION OF THE R18 POPULATION.
 *
 * R18 proposed. R19 asks what the EVIDENCE supports, and the evidence may not be
 * the extractor's own answer — it is the thing under test. Every rule here is a
 * statement about what the retained text and the court's own identity keys say:
 *
 *   the CNR is a sixteen-character key the court issues to ONE case. A document
 *   that prints `<CNR> <citation>` is naming that case's number. When the CNR
 *   printed beside the stored citation is not this row's, and it resolves in the
 *   corpus to a different judgment, the stored value is that judgment's — which
 *   is affirmative proof, not the absence of a prediction.
 *
 * The protective classes are tested FIRST and on purpose. A row whose own CNR
 * stands beside the stored citation is a row R18 proposed to empty and must not
 * be emptied, and that verdict has to be reachable before any destructive one.
 *
 * Read-only. The only database work is resolving observed CNRs and citation keys
 * against `judgments`, in batches, on indexed columns.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-adjudicate.mts [--window 60]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUTDIR = join(ROOT, 'docs/ai/new2-r19');
const EVIDENCE = join(OUTDIR, 'evidence.jsonl');
const OUT = join(OUTDIR, 'adjudication.jsonl');
const SUMMARY = join(OUTDIR, 'adjudication-summary.json');
const W = Number(arg('window', '60'));
const NL = String.fromCharCode(10);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Near = { v: string; dist: number } | null;
type Occ = {
  at: number;
  prevCnr: Near;
  nextCnr: Near;
  prevOwnCnr: number | null;
  nextOwnCnr: number | null;
  prevOwnPair: number | null;
  nextOwnPair: number | null;
  prevForeignPair: Near;
  nextForeignPair: Near;
  prevLead: Near;
  window: string;
};
type Ev = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  judgmentDate: string | null;
  partitionYear: number | null;
  reasonClass: string;
  storedAtR18: string;
  storedNow: string;
  storedValueMovedSinceR18: boolean;
  proposedValue: string | null;
  seriesToken: string | null;
  seriesHomeCourt: string | null;
  seriesIsAnotherCourts: boolean;
  evidenceState: string;
  textLen: number;
  ctrlDensity: number;
  engDensity: number;
  ownCnrInText: boolean;
  ownPairInText: boolean;
  ownIdentityInText: boolean;
  foreignCnrsInText: string[];
  distinctCitationsInText: { v: string; count: number; firstAt: number }[];
  distinctCitationCount: number;
  storedOccurrences: Occ[];
  proposedOccurrences: Occ[];
  ownAnchoredOtherCitations: string[];
  r18DistinctEligible: number;
};

const within = (d: number | null | undefined, w = W): boolean => d !== null && d !== undefined && d <= w;
const nearWithin = (n: Near, w = W): boolean => n !== null && n.dist <= w;

/** The row's own identity stands beside this occurrence, on either side. */
const ownCnrAdjacent = (o: Occ): boolean => within(o.prevOwnCnr) || within(o.nextOwnCnr);
const ownPairAdjacent = (o: Occ): boolean => within(o.prevOwnPair) || within(o.nextOwnPair);

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  mkdirSync(OUTDIR, { recursive: true });
  const rows: Ev[] = readFileSync(EVIDENCE, 'utf8')
    .split(NL)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Ev);
  console.log(`[r19] evidence ${rows.length} rows, adjacency window ${W} chars`);

  // ---- corpus resolution ---------------------------------------------------
  // Only CNRs that actually stand beside a stored occurrence are resolved: the
  // question is never "does this CNR exist" but "is the citation printed beside
  // it somebody else's".
  const wantedCnr = new Set<string>();
  for (const r of rows) {
    for (const o of r.storedOccurrences) {
      if (nearWithin(o.prevCnr)) wantedCnr.add(o.prevCnr!.v);
      if (nearWithin(o.nextCnr)) wantedCnr.add(o.nextCnr!.v);
    }
    for (const o of r.proposedOccurrences) {
      if (nearWithin(o.prevCnr)) wantedCnr.add(o.prevCnr!.v);
    }
  }
  const cnrList = [...wantedCnr];
  console.log(`[r19] resolving ${cnrList.length} distinct adjacent CNRs`);
  const cnrHome = new Map<string, { id: string; court: string; citation: string | null; caseNumber: string | null }>();
  for (let i = 0; i < cnrList.length; i += 2000) {
    const chunk = cnrList.slice(i, i + 2000);
    const got = await sql<{ id: string; cnr: string; court: string; neutral_citation: string | null; case_number: string | null }[]>`
      SELECT id::text AS id, cnr, court, neutral_citation, case_number
        FROM judgments
       WHERE cnr = ANY(${chunk}::text[])`;
    for (const g of got)
      if (!cnrHome.has(g.cnr))
        cnrHome.set(g.cnr, { id: g.id, court: g.court, citation: g.neutral_citation, caseNumber: g.case_number });
  }
  console.log(`[r19] ${cnrHome.size} of ${cnrList.length} adjacent CNRs exist in judgments`);

  // The token/court matrix is a SQL frequency count over the corpus. It is
  // independent of the extractor and R18 cached it; reused rather than recounted
  // because recounting costs three minutes of shared I/O and returns the same map.
  const tokenMatrix = JSON.parse(readFileSync(join(ROOT, 'docs/ai/new2-r18/token-court-matrix.json'), 'utf8')) as {
    rows: { court: string; tok: string | null; n: string }[];
  };
  const byToken = new Map<string, Map<string, number>>();
  for (const t of tokenMatrix.rows) {
    if (!t.tok) continue;
    const m = byToken.get(t.tok) ?? new Map<string, number>();
    m.set(t.court, (m.get(t.court) ?? 0) + Number(t.n));
    byToken.set(t.tok, m);
  }
  const homeOf = new Map<string, string>();
  for (const [tok, m] of byToken) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const top = [...m].sort((a, b) => b[1] - a[1])[0]!;
    if (total >= 25 && top[1] / total >= 0.9) homeOf.set(tok, top[0]);
  }
  const tokenOf = (c: string | null): string | null =>
    c ? (/^\d{4}:([A-Z][A-Z-]{1,13}):/.exec(c)?.[1] ?? null) : null;
  const numberOf = (c: string | null): string | null => (c ? (/:(\d{1,6})(?:-(?:DB|FB))?$/.exec(c)?.[1] ?? null) : null);
  const placedFor = (c: string | null, court: string): 'PLACED_THIS_COURT' | 'PLACED_OTHER_COURT' | 'NO_HOME' => {
    const t = tokenOf(c);
    if (!t) return 'NO_HOME';
    const h = homeOf.get(t);
    if (!h) return 'NO_HOME';
    return h === court ? 'PLACED_THIS_COURT' : 'PLACED_OTHER_COURT';
  };

  // ---- the rules -----------------------------------------------------------
  const counts: Record<string, number> = {};
  const byCourtNull: Record<string, Record<string, number>> = {};
  const bump = (k: string, by = 1): void => {
    counts[k] = (counts[k] ?? 0) + by;
  };
  const out: string[] = [];

  for (const r of rows) {
    const occ = r.storedOccurrences;
    const damaged = r.ctrlDensity > 0.005 || r.engDensity < 0.5;
    const anyOwnCnrAdj = occ.some(ownCnrAdjacent);
    const anyOwnPairAdj = occ.some(ownPairAdjacent);

    // A foreign CNR "owns" the stored citation only when EVERY printed
    // occurrence of it is introduced by one, and that CNR is a real other case.
    const foreignLeadCnrs: string[] = [];
    let everyOccForeignCnr = occ.length > 0;
    for (const o of occ) {
      const cand = [o.prevCnr, o.nextCnr]
        .filter((n): n is { v: string; dist: number } => nearWithin(n))
        .sort((a, b) => a.dist - b.dist)[0];
      const resolved = cand ? cnrHome.get(cand.v) : undefined;
      if (cand && resolved && resolved.id !== r.judgmentId) foreignLeadCnrs.push(cand.v);
      else everyOccForeignCnr = false;
    }
    const corroborated =
      foreignLeadCnrs.length > 0 && foreignLeadCnrs.every((c) => cnrHome.get(c)?.citation === r.storedNow);

    const everyOccCitingPhrase = occ.length > 0 && occ.every((o) => nearWithin(o.prevLead));

    let verdict: string;
    let rule: string;
    let destructive: 'NULL' | 'REPLACE' | 'NONE' = 'NONE';

    if (r.reasonClass === 'REPLACE_WITH_DIFFERENT_OWN_CITATION') {
      const p = r.proposedValue;
      const sameNumber = numberOf(p) !== null && numberOf(p) === numberOf(r.storedNow);
      const tokenChanged = tokenOf(p) !== tokenOf(r.storedNow);
      const storedPlaced = placedFor(r.storedNow, r.court);
      const proposedPlaced = placedFor(p, r.court);
      const proposedOwnCnrAdj = r.proposedOccurrences.some(ownCnrAdjacent);
      const proposedOwnPairAdj = r.proposedOccurrences.some(ownPairAdjacent);
      const storedDisowned = everyOccForeignCnr || occ.every((o) => nearWithin(o.prevForeignPair) || nearWithin(o.prevLead));

      if (damaged) {
        verdict = 'REPLACE_UNTESTABLE';
        rule = 'R0_DAMAGE';
      } else if (p !== null && /^\d{4}:[A-Z][A-Z-]{1,13}:\d{1,6}-(?:DB|FB)$/.test(p) && p.startsWith(r.storedNow)) {
        // The stored value is the proposal minus its printed suffix: the -DB
        // boundary defect, which is quarantined until LCC reports parity.
        verdict = 'REPLACE_DB_SUFFIX_QUARANTINE';
        rule = 'R3_SUFFIX_ONLY';
      } else if (anyOwnCnrAdj) {
        verdict = 'CURRENT_VALUE_PROVEN_CORRECT';
        rule = 'R1_OWN_CNR_BESIDE_STORED';
      } else if (tokenChanged && sameNumber) {
        // Same serial, different series token. One of the two is a scan of the
        // other and identity anchoring cannot say which — it settles WHICH
        // occurrence is the document's, never how that occurrence was scanned.
        verdict =
          storedPlaced === 'PLACED_THIS_COURT' && proposedPlaced !== 'PLACED_THIS_COURT'
            ? 'SCAN_DAMAGE_CONFLICT'
            : proposedPlaced === 'PLACED_THIS_COURT' && storedPlaced !== 'PLACED_THIS_COURT'
              ? 'SCAN_DAMAGE_CONFLICT_REPAIR_DIRECTION'
              : 'SCAN_DAMAGE_CONFLICT';
        rule = 'R2_SERIES_TOKEN_SCAN_CONFLICT';
      } else if (tokenChanged) {
        verdict = 'REPLACE_AMBIGUOUS';
        rule = 'R2b_TOKEN_CHANGED_DIFFERENT_NUMBER';
      } else if ((proposedOwnCnrAdj || proposedOwnPairAdj) && storedDisowned && proposedPlaced === 'PLACED_THIS_COURT') {
        verdict = 'PROVEN_REPLACEMENT';
        rule = proposedOwnCnrAdj ? 'R4a_TWO_SIDED_CNR' : 'R4b_TWO_SIDED_CASE_NUMBER';
        destructive = 'REPLACE';
      } else {
        verdict = 'REPLACE_AMBIGUOUS';
        rule = 'R5_NO_TWO_SIDED_PROOF';
      }
    } else if (r.reasonClass === 'CLEAR_TO_NULL') {
      if (damaged) {
        verdict = 'SOURCE_DAMAGE';
        rule = 'C4_DAMAGE';
      } else if (anyOwnCnrAdj) {
        verdict = 'CURRENT_VALUE_PROVEN_CORRECT';
        rule = 'C1a_OWN_CNR_BESIDE_STORED';
      } else if (everyOccForeignCnr && !anyOwnPairAdj) {
        verdict = corroborated ? 'PROVEN_FOREIGN_TO_DOCUMENT' : 'PROVEN_FOREIGN_TO_DOCUMENT_UNCORROBORATED';
        rule = corroborated ? 'C2a_FOREIGN_CNR_CORROBORATED' : 'C2b_FOREIGN_CNR_UNCORROBORATED';
        destructive = 'NULL';
      } else if (everyOccCitingPhrase && !anyOwnPairAdj) {
        verdict = 'PROVEN_EXTRACTION_FALSE_OWN';
        rule = 'C3_CITED_PRECEDENT_LEAD';
        destructive = 'NULL';
      } else if (anyOwnPairAdj) {
        verdict = 'CURRENT_VALUE_SUPPORTED_BY_OWN_CASE_NUMBER';
        rule = 'C1b_OWN_CASE_NUMBER_BESIDE_STORED';
      } else if (!r.ownIdentityInText) {
        verdict = 'TEXT_IDENTITY_MISMATCH';
        rule = 'C5_OWN_IDENTITY_ABSENT';
      } else if (r.distinctCitationCount >= 2) {
        verdict = 'NULL_AMBIGUOUS';
        rule = 'C6_COMPETING_CITATIONS';
      } else {
        verdict = 'NO_SAFE_OWN_BUT_NOT_PROVEN_WRONG';
        rule = 'C7_REFUSAL_ONLY';
      }
      const bc = (byCourtNull[r.court] ??= {});
      bc[verdict] = (bc[verdict] ?? 0) + 1;
    } else if (r.reasonClass === 'AMBIGUOUS') {
      verdict = r.r18DistinctEligible >= 2 ? 'TIED_OWN_ID_CANDIDATES' : 'AMBIGUOUS_WEAK_TIER';
      rule = 'A1_CARRIED_AMBIGUOUS';
    } else if (r.reasonClass === 'NOT_A_NEUTRAL_CITATION_DATE_STAMP') {
      // `2011:APRIL:05` is not a citation of any court's series. That is a
      // structural fact about the STORED string, not a prediction.
      verdict = 'PROVEN_NOT_A_CITATION';
      rule = 'D1_MONTH_IN_SERIES_POSITION';
      destructive = 'NULL';
    } else {
      verdict = 'SOURCE_GENUINE_FOREIGN_CITATION_CARRIED';
      rule = 'F1_CARRIED';
    }

    bump(`${r.reasonClass}::${verdict}`);
    bump(`VERDICT::${verdict}`);
    bump(`RULE::${rule}`);
    if (destructive !== 'NONE') bump(`DESTRUCTIVE::${destructive}`);

    out.push(
      JSON.stringify({
        judgmentId: r.judgmentId,
        court: r.court,
        caseNumber: r.caseNumber,
        cnr: r.cnr,
        r18Class: r.reasonClass,
        stored: r.storedNow,
        proposed: r.proposedValue,
        verdict,
        rule,
        destructive,
        evidence: {
          adjacencyWindow: W,
          anyOwnCnrAdjacent: anyOwnCnrAdj,
          anyOwnCaseNumberAdjacent: anyOwnPairAdj,
          everyOccurrenceForeignCnrLed: everyOccForeignCnr,
          foreignLeadCnrs: [...new Set(foreignLeadCnrs)].slice(0, 4),
          foreignLeadResolvesToCitation: [...new Set(foreignLeadCnrs)].slice(0, 4).map((c) => cnrHome.get(c)?.citation ?? null),
          everyOccurrenceCitingPhraseLed: everyOccCitingPhrase,
          ownIdentityInText: r.ownIdentityInText,
          distinctCitationCount: r.distinctCitationCount,
          ctrlDensity: r.ctrlDensity,
          engDensity: r.engDensity,
          storedTokenPlacement: placedFor(r.storedNow, r.court),
          proposedTokenPlacement: r.proposedValue ? placedFor(r.proposedValue, r.court) : null,
        },
        firstWindow: occ[0]?.window ?? null,
      }),
    );
  }

  writeFileSync(OUT, out.join(NL) + NL);
  const summary = {
    artifact: 'NEW2_R19_ADJUDICATION',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    input: {
      populationId: 'NEW2-R18-EXISTING-9679cff06d0e6404',
      rows: rows.length,
      adjacencyWindow: W,
    },
    groundTruthSource:
      'retained text plus court-issued CNR and the metadata case number, resolved against judgments. The extractor under test contributes nothing to any verdict here.',
    adjacentCnrsResolved: { asked: cnrList.length, found: cnrHome.size },
    counts,
    byCourtForClearToNull: byCourtNull,
    rowsFileSha256: createHash('sha256').update(readFileSync(OUT)).digest('hex'),
  };
  writeFileSync(SUMMARY, JSON.stringify(summary, null, 1) + NL);
  console.log(JSON.stringify(counts, null, 1));
} finally {
  await sql.end({ timeout: 5 });
}
