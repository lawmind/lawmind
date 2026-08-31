/**
 * LCC R15-F1 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * NEW2 (bus 1637, NEW2-R15-F1) showed the shipped cohort gate captures the
 * matter TYPE as `[A-Z]...` while matching connectors case-insensitively, so a
 * title-case common order reads connector=WITH, declaredMatters=0 and the gate
 * fails OPEN on the exact shape it exists to refuse.
 *
 * The obvious repair — drop the case-sensitivity — is measured here and must not
 * be assumed: case-sensitivity had been acting as an accidental prose filter,
 * because Indian judgment prose is title case and registry cause titles are not
 * exclusively so. This sweep scores candidate grammars side by side on the
 * instrument the previous round used (NEW2's temporal holdout, T0 2026-08-18),
 * so the grammar is CHOSEN by recall/false-refusal rather than by assertion.
 *
 *   pnpm exec tsx scripts/lcc-r15f1-grammar-sweep.mts [controlSample]
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const T0 = '2026-08-18';
const W = 800;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

// ───────────────────────── the shipped grammar, frozen ─────────────────────────
// Verbatim from services/api/src/citations/cohort.ts at 93ca23f4, so the
// counterfactual arm cannot drift when the module is corrected.
const S_LONG =
  /([A-Z][A-Z.&'-]*(?:[ \t]+[A-Z][A-Z.&'-]*){0,4})[ \t]*(?:No[.s]?|NO[.S]?|Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|OF|\/)[ \t]*((?:19|20)\d{2})\b/g;
const S_SLASH = /([A-Z][A-Z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/g;

// ───────────────────────── the candidate grammar pieces ────────────────────────
const I_LONG =
  /([A-Za-z][A-Za-z.&'-]*(?:[ \t]+(?:[A-Za-z][A-Za-z.&'-]*|[-–—])){0,4})[ \t]*(?:Nos?\.?)[ \t]*[-.:]?[ \t]*(\d{1,7})[ \t]*(?:of|\/)[ \t]*((?:19|20)\d{2})\b/gi;
const I_SLASH = /([A-Za-z][A-Za-z.&'-]{0,15})[ \t]*\/[ \t]*(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/gi;
const A_LONG = new RegExp('^' + I_LONG.source, 'i');
const A_SLASH = new RegExp('^' + I_SLASH.source, 'i');

const CONNECTORS = [
  { re: /\bC\s*\/\s*W\b/i, name: 'C/W' },
  { re: /\bA\s*\/\s*W\b/i, name: 'A/W' },
  { re: /\bconnected\s+with\b/i, name: 'CONNECTED WITH' },
  { re: /\balong\s*with\b/i, name: 'ALONG WITH' },
  { re: /(^|\n)\s*with\b/i, name: 'WITH' },
];
/** Every connector as ONE splitter, so a matter printed after a conjunction on
 *  the SAME line is still at a segment start. */
const CONNECTOR_SPLIT =
  /\bC\s*\/\s*W\b|\bA\s*\/\s*W\b|\bconnected\s+with\b|\balong\s*with\b|\bwith\b/gi;
/** Bounded leading noise a registry prints before the type: a serial, a bullet,
 *  a bracket, the Allahabad `Case :-` label. Bounded on purpose — it strips a
 *  prefix, it never searches for a matter. */
const LEAD = /^[\s(\[*\-–—.:;,#•]*(?:\d{1,4}\s*[.)\]]?[ \t]+)?[\s(\[*\-–—.:;,#•]*/;
const LABEL = /^(?:case|matter|item)[ \t]*:[-–—\s]*/i;

const PARENT_MATTER = /\b(?:IN|ARISING\s+(?:OUT\s+)?(?:OF|FROM)|FROM)[ \t]*$/i;
const PARENT_LEADING = /^(?:IN|ARISING|FROM)\b/i;
const NOT_A_MATTER =
  /^(SECTION|SECTIONS|ACT|ACTS|ARTICLE|ARTICLES|RULE|RULES|ORDER|ORDERS|CHAPTER|PART|SCHEDULE|CLAUSE|REGULATION|NOTIFICATION|AMENDMENT|ANNEXURE|PARA|PARAGRAPH|VOLUME|PAGE|EDITION|ITEM)$/;

const typeToken = (c: string) =>
  c.trim().split(/[ \t]+/).slice(-2).join('').toUpperCase().replace(/[^A-Z]/g, '');

function push(
  found: Set<string>,
  type: string,
  serial: string,
  year: string,
  mode: 'type' | 'serial',
) {
  const t = typeToken(type);
  if (t.length === 0 || NOT_A_MATTER.test(t)) return;
  const n = serial.replace(/^0+/, '') || '0';
  found.add(mode === 'type' ? `${t}|${n}|${year}` : `${n}|${year}`);
}

/** Unanchored scan — the shipped shape, with either case rule. */
function scanUnanchored(window: string, res: RegExp[], mode: 'type' | 'serial') {
  const found = new Set<string>();
  for (const re of res) {
    re.lastIndex = 0;
    for (let m = re.exec(window); m !== null; m = re.exec(window)) {
      if (PARENT_MATTER.test(window.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      push(found, m[1]!, m[2]!, m[3]!, mode);
    }
  }
  return found.size;
}

/**
 * Anchored scan. A matter DECLARATION is a structural position, not a run of
 * capitals: it opens a line, or it opens the text immediately after a
 * conjunction the court printed. A case number recited mid-sentence — the FIR
 * the bail arises from, the sessions trial below the appeal — is a reference,
 * not a sibling, and the census (`docs/ai/lcc-r15f1/matter-form-census.json`)
 * says that recital is where nearly all the title-case matches live.
 */
function segmentsOf(window: string): string[] {
  const out: string[] = [];
  for (const line of window.split(/\r?\n/)) {
    let last = 0;
    CONNECTOR_SPLIT.lastIndex = 0;
    for (let m = CONNECTOR_SPLIT.exec(line); m !== null; m = CONNECTOR_SPLIT.exec(line)) {
      out.push(line.slice(last, m.index));
      last = m.index + m[0].length;
    }
    out.push(line.slice(last));
  }
  return out;
}

function scanAnchored(window: string, mode: 'type' | 'serial', capWordOnly: boolean) {
  const found = new Set<string>();
  for (const raw of segmentsOf(window)) {
    const seg = raw.replace(LEAD, '').replace(LABEL, '').replace(LEAD, '');
    for (const re of [A_LONG, A_SLASH]) {
      const m = re.exec(seg);
      if (m === null) continue;
      if (PARENT_LEADING.test(m[1]!.trim())) continue;
      if (capWordOnly && m[1]!.trim().split(/[ \t]+/).some((w) => /^[a-z]/.test(w))) continue;
      push(found, m[1]!, m[2]!, m[3]!, mode);
    }
  }
  return found.size;
}

const connectorOf = (w: string) => CONNECTORS.find((c) => c.re.test(w))?.name ?? null;

const VARIANTS: Record<string, (head: string) => boolean> = {
  V0_SHIPPED_UPPER: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanUnanchored(w, [S_LONG, S_SLASH], 'type') > 1;
  },
  V1_CASE_INSENSITIVE: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanUnanchored(w, [I_LONG, I_SLASH], 'type') > 1;
  },
  V2_CI_ANCHORED: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanAnchored(w, 'type', false) > 1;
  },
  V3_CI_ANCHORED_SERIALYEAR: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanAnchored(w, 'serial', false) > 1;
  },
  V4_CI_ANCHORED_CAPWORD: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanAnchored(w, 'type', true) > 1;
  },
  V5_CI_ANCHORED_CAPWORD_SERIALYEAR: (h) => {
    const w = h.slice(0, W);
    return connectorOf(w) !== null && scanAnchored(w, 'serial', true) > 1;
  },
};

type Row = { citation_key: string; head: string; same_court: boolean; same_date: boolean };

const positives = () => sql<Row[]>`
  WITH shape AS (
    SELECT f.citation_key,
           count(DISTINCT j.court) = 1 AS same_court,
           count(DISTINCT j.judgment_date) = 1 AS same_date
      FROM lcc_r15_falseunique f
      JOIN judgment_citation_keys k ON k.citation_key = f.citation_key
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY f.citation_key
  )
  SELECT DISTINCT ON (s.citation_key) s.citation_key, s.same_court, s.same_date,
         left(j.full_text, 2400) AS head
    FROM shape s
    JOIN judgment_citation_keys k ON k.citation_key = s.citation_key AND k.created_at < ${T0}::timestamptz
    JOIN judgments j ON j.id = k.judgment_id
   ORDER BY s.citation_key, k.created_at`;

const controls = (n: number) => sql<{ citation_key: string; head: string }[]>`
  WITH t0 AS (
    SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${T0}::timestamptz
     GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
  ), still AS (
    SELECT k.citation_key, min(k.judgment_id::text) AS jid
      FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
     GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) = 1
  )
  SELECT s.citation_key, left(j.full_text, 2400) AS head
    FROM still s JOIN judgments j ON j.id = s.jid::uuid
   WHERE mod(abs(hashtext(s.citation_key)), 397) = 11
   LIMIT ${n}`;

const pos = await positives();
const ctl = await controls(Number(process.argv[2] ?? 6000));
const rec = pos.filter((p) => p.same_court && p.same_date);

const out: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  t0: T0,
  causeTitleChars: W,
  positives: pos.length,
  positivesRecoverable: rec.length,
  positivesOutOfScope: pos.length - rec.length,
  controls: ctl.length,
  variants: {} as Record<string, unknown>,
};

console.log(`positives ${pos.length} (recoverable ${rec.length}) · controls ${ctl.length}\n`);
for (const [name, fires] of Object.entries(VARIANTS)) {
  const hitRec = rec.filter((p) => fires(p.head)).length;
  const hitAll = pos.filter((p) => fires(p.head)).length;
  const hitCtl = ctl.filter((c) => fires(c.head)).length;
  (out.variants as Record<string, unknown>)[name] = {
    recoverableCaught: hitRec,
    recoverableRecall: hitRec / rec.length,
    positivesCaught: hitAll,
    controlsRefused: hitCtl,
    controlFalseRefusalRate: hitCtl / ctl.length,
  };
  console.log(
    name.padEnd(34),
    `recoverable ${String(hitRec).padStart(3)}/${rec.length}`,
    `(${((hitRec / rec.length) * 100).toFixed(1)}%)`,
    ` controls ${String(hitCtl).padStart(4)}/${ctl.length}`,
    `(${((hitCtl / ctl.length) * 100).toFixed(2)}%)`,
  );
}

// ───────────────────────── diagnostics the round asks for ─────────────────────
// A count that moves by one is not evidence the composition is unchanged, and a
// grammar that catches "the same 97" may be catching a different 97. Set
// differences against the shipped arm, and the recognition rate — how many cause
// titles the parser reads AT ALL — which is the number NEW2's finding is about.
const caught: Record<string, Set<string>> = {};
for (const [name, fires] of Object.entries(VARIANTS)) {
  caught[name] = new Set(rec.filter((p) => fires(p.head)).map((p) => p.citation_key));
}
const base = caught['V0_SHIPPED_UPPER']!;
const diffs: Record<string, unknown> = {};
for (const [name, set] of Object.entries(caught)) {
  if (name === 'V0_SHIPPED_UPPER') continue;
  const gained = [...set].filter((k) => !base.has(k));
  const lost = [...base].filter((k) => !set.has(k));
  diffs[name] = { gained: gained.length, lost: lost.length, gainedKeys: gained, lostKeys: lost };
  console.log(`${name.padEnd(34)} vs shipped:  +${gained.length}  -${lost.length}`);
}
out.recoverableSetDiffVsShipped = diffs;

const READERS: Record<string, (w: string) => number> = {
  V0_SHIPPED_UPPER: (w) => scanUnanchored(w, [S_LONG, S_SLASH], 'type'),
  V1_CASE_INSENSITIVE: (w) => scanUnanchored(w, [I_LONG, I_SLASH], 'type'),
  V2_CI_ANCHORED: (w) => scanAnchored(w, 'type', false),
  V3_CI_ANCHORED_SERIALYEAR: (w) => scanAnchored(w, 'serial', false),
  V4_CI_ANCHORED_CAPWORD: (w) => scanAnchored(w, 'type', true),
  V5_CI_ANCHORED_CAPWORD_SERIALYEAR: (w) => scanAnchored(w, 'serial', true),
};
const recog: Record<string, { scanned: number; recognized: number; rate: number }> = {};
console.log("\nRECOGNITION — cause titles the parser reads at all, on the 2,295 controls");
for (const [name, read] of Object.entries(READERS)) {
  const n = ctl.filter((c) => read(c.head.slice(0, W)) >= 1).length;
  recog[name] = { scanned: ctl.length, recognized: n, rate: n / ctl.length };
  console.log(`${name.padEnd(34)} ${String(n).padStart(4)}/${ctl.length} (${((n / ctl.length) * 100).toFixed(1)}%)`);
}
out.recognitionOnControls = recog;

mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync('docs/ai/lcc-r15f1/grammar-sweep.json', JSON.stringify(out, null, 2) + '\n');
console.log('\nwrote docs/ai/lcc-r15f1/grammar-sweep.json');
await sql.end();
