/**
 * `pnpm --filter @lawmind/ingest statute:mappings <dir-of-txt> [--apply]`
 *
 * Loads `statute_mappings` from the BPRD correspondence tables — the FIRST rows
 * that table has ever held.
 *
 * **DRY BY DEFAULT.** `--apply` writes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ALLOWED TO WRITE NOW, AND WHAT STILL MAY NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `statute-correspondence-cli.ts` is report-only by the founder's "report first"
 * and stays that way. The 20 Aug direction opens the write path on one condition:
 * *"Do not invent mappings with an LLM. Begin populating only from authoritative
 * sources already held/discovered."*
 *
 * So: no model is called anywhere in this path, every row carries the source line
 * it was read from, and a row the parser could not read is COUNTED and left out
 * rather than guessed at. `docs/DOMAIN_TRUTH.md` classes the BPRD comparison
 * summaries as a CORRESPONDENCE TABLE — usable as a mapping, never as statute
 * text — which is exactly and only what this writes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MAPPING IS NOT 1:1 AND THIS DOES NOT PRETEND IT IS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BNS 5 corresponds to IPC 54, 55 AND 55A. That is THREE rows sharing one new
 * section, and `relationship = 'merged'` on each — several old provisions
 * gathered into one new one. Writing BNS 5 → IPC 54 alone would be a partial
 * mapping presented as complete: fabrication by omission, which is the failure
 * the founder's instruction names.
 *
 *   exact     one old section, one new section
 *   merged    several old sections under one new section
 *   split     one old section appearing under several new sections
 *
 * `split` is computed ACROSS rows after parsing — a single row cannot see it —
 * and it wins over `exact` because it is the more specific fact. `no_equivalent`
 * is not written by this loader at all: BPRD marks the NEW side `New`, and
 * `old_section` is NOT NULL, so those provisions are counted and reported rather
 * than given a placeholder counterpart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRINTED-LINE GATE, AND THE WRONG MAPPING THAT MADE IT NECESSARY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Spot-checking the parse against the source before writing a single row turned
 * up this, in BNSS:
 *
 *     parsed:  BNSS 24  ->  CrPC 201
 *     line 123: `24 New proviso is added to subsection (1).`
 *
 * **`201` does not appear on that line.** The parser reads by COLUMN POSITION,
 * and where a summary wraps, a number from a neighbouring row lands in the
 * old-section column. Written, that row would tell an advocate that BNSS 24
 * replaces CrPC 201, which it does not.
 *
 * So every mapping must survive the same test a legal-object claim survives: the
 * thing asserted has to appear in the source span. The old section number must
 * appear as a standalone token in the printed line or the two lines after it —
 * two, because BPRD prints continuations like `55A` on the next line, in the
 * column. It is a weak check by design: it cannot prove the mapping is right, and
 * it does reject every row whose old section was invented by column drift.
 *
 * Rejections are counted and printed per pair. A gate whose refusals are not
 * visible is indistinguishable from a gate that never fires.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COVERAGE IS PARTIAL AND IS PRINTED EVERY RUN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Parser v2 reads 6.4% of BNS, 42.4% of BNSS and 70.6% of BSA. The rest is the
 * PARSER's limit, not the source's — rows like `21  23 Admissions in civil cases`
 * are readable by eye and mis-sliced by column position. A consumer that treats
 * this table as complete will conclude an IPC section has no BNS counterpart when
 * it simply has not been read yet, so the absence of a row means NOTHING and the
 * report says so on every run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { openDb } from './db-host.ts';
import { type ActPair, PARSER_VERSION, parseCorrespondence } from './statute-correspondence.ts';

const dir = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!dir || dir.startsWith('--')) {
  console.error('usage: statute-mappings-load-cli.ts <dir containing bns.txt bnss.txt bsa.txt> [--apply]');
  process.exit(2);
}

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}

/** Sections each new Act actually contains — the denominator for coverage. */
const EXPECTED: Record<ActPair, number> = { 'BNS-IPC': 358, 'BNSS-CrPC': 531, 'BSA-IEA': 170 };

/** The three official documents, by the URL that asserts each correspondence. */
const SOURCE_URL: Record<ActPair, string> = {
  'BNS-IPC': 'https://bprd.nic.in/uploads/pdf/COMPARISON%20SUMMARY%20BNS%20to%20IPC%20.pdf',
  'BNSS-CrPC': 'https://bprd.nic.in/uploads/pdf/Comparison%20summary%20BNSS%20to%20CrPC.pdf',
  'BSA-IEA': 'https://bprd.nic.in/uploads/pdf/Comparison%20Summary%20BSA%20to%20IEA.pdf',
};

const ACTS: Record<ActPair, { oldAct: string; newAct: string; file: string; shortTitle: RegExp }> = {
  'BNS-IPC': { oldAct: 'ipc', newAct: 'bns', file: 'bns', shortTitle: /nyaya sanhita/i },
  'BNSS-CrPC': { oldAct: 'crpc', newAct: 'bnss', file: 'bnss', shortTitle: /nagarik suraksha/i },
  'BSA-IEA': { oldAct: 'evidence', newAct: 'bsa', file: 'bsa', shortTitle: /sakshya/i },
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The printed-line gate. The old section must appear as a STANDALONE token in
 * the source window — `89` must not be satisfied by `189`, and `55A` must not be
 * satisfied by `55`.
 */
const grounded = (section: string, window: string): boolean =>
  new RegExp(`(^|[^0-9A-Za-z])${escapeRe(section)}([^0-9A-Za-z]|$)`).test(window);

type Pending = {
  pair: ActPair;
  oldAct: string;
  oldSection: string;
  newAct: string;
  newSection: string;
  relationship: 'exact' | 'merged' | 'split';
  note: string;
  sourceLine: number;
  evidence: string;
};

const sql = await openDb(dbUrl, 2);

try {
  /**
   * Commencement comes from the `statutes` rows, never from a literal here.
   * `transition.ts` REFUSES to name a regime when those rows disagree; a second
   * hard-coded copy of the date is how the two would start disagreeing silently.
   */
  const commencement = await sql<{ short_title: string; enforcement_date: Date | null }[]>`
    SELECT short_title, enforcement_date FROM statutes WHERE enforcement_date IS NOT NULL`;

  const effectiveFor = (pair: ActPair): string | null => {
    const row = commencement.find((r) => ACTS[pair].shortTitle.test(r.short_title));
    return row?.enforcement_date ? row.enforcement_date.toISOString().slice(0, 10) : null;
  };

  const pending: Pending[] = [];
  let newlyAddedTotal = 0;

  for (const pair of Object.keys(ACTS) as ActPair[]) {
    const spec = ACTS[pair];
    const text = readFileSync(join(dir, `${spec.file}.txt`), 'utf8');
    const lines = text.split(/\r?\n/);
    const { rows, unparsed, ambiguous } = parseCorrespondence(text);

    const distinct = new Set(rows.map((r) => r.newSection)).size;
    const newly = rows.filter((r) => r.newlyAdded).length;
    newlyAddedTotal += newly;

    /** `split` needs the whole pair in view — one old section under two new ones. */
    const newByOld = new Map<string, Set<string>>();
    for (const r of rows) {
      for (const o of r.oldRefs) {
        const set = newByOld.get(o.section) ?? new Set<string>();
        set.add(r.newSection);
        newByOld.set(o.section, set);
      }
    }

    let loadable = 0;
    let ungrounded = 0;
    for (const r of rows) {
      if (r.newlyAdded || r.oldRefs.length === 0) continue;
      const evidence = (lines[r.sourceLine - 1] ?? '').replace(/\s+/g, ' ').trim();
      // A row whose printed line cannot be recovered has no evidence, and a
      // mapping with no evidence is not loaded. See migration 0060's comment.
      if (evidence.length < 4) continue;
      /** Two lines of slack: BPRD prints a continuation like `55A` on the next line. */
      const window = lines
        .slice(r.sourceLine - 1, r.sourceLine + 2)
        .join(' ')
        .replace(/\s+/g, ' ');

      for (const o of r.oldRefs) {
        if (!grounded(o.section, window)) {
          ungrounded++;
          continue;
        }
        const manyNew = (newByOld.get(o.section)?.size ?? 1) > 1;
        const relationship = manyNew ? 'split' : r.oldRefs.length > 1 ? 'merged' : 'exact';
        pending.push({
          pair,
          oldAct: spec.oldAct,
          oldSection: o.paragraph === null ? o.section : `${o.section}(${o.paragraph})`,
          newAct: spec.newAct,
          newSection: r.newSection,
          relationship,
          note: r.subject.replace(/\s+/g, ' ').trim().slice(0, 500),
          sourceLine: r.sourceLine,
          evidence: evidence.slice(0, 1000),
        });
        loadable++;
      }
    }

    const effective = effectiveFor(pair);
    console.log(`${pair}`);
    console.log(`  parsed rows        ${rows.length}   distinct new sections ${distinct} of ${EXPECTED[pair]} (${((100 * distinct) / EXPECTED[pair]).toFixed(1)}%)`);
    console.log(`  mappings to load   ${loadable}   (one per old section named)`);
    console.log(`  marked "New"       ${newly}   NOT loaded — old_section is NOT NULL and no placeholder is invented`);
    console.log(`  UNGROUNDED         ${ungrounded}   old section absent from its own printed line — column drift, dropped`);
    console.log(`  ambiguous          ${ambiguous.length}   unparsed ${unparsed.length}   — the PARSER's limit, not the source's`);
    console.log(`  effective_date     ${effective ?? 'UNKNOWN — statutes carries no enforcement_date for this act'}`);
    console.log('');
  }

  const byRelationship = new Map<string, number>();
  for (const p of pending) byRelationship.set(p.relationship, (byRelationship.get(p.relationship) ?? 0) + 1);
  console.log(`TOTAL ${pending.length} mappings · ${[...byRelationship].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`${newlyAddedTotal} provisions marked "New" across all three pairs, none loaded.`);

  const missingDate = (Object.keys(ACTS) as ActPair[]).filter((p) => effectiveFor(p) === null);
  if (missingDate.length > 0) {
    console.log(`\nWARNING: no enforcement_date in \`statutes\` for ${missingDate.join(', ')} — those rows load with a NULL effective_date rather than a guessed one.`);
  }

  if (!APPLY) {
    console.log('\nNothing written — re-run with --apply.');
  } else {
    let written = 0;
    for (const p of pending) {
      const effective = effectiveFor(p.pair);
      await sql`
        INSERT INTO statute_mappings (old_act, old_section, new_act, new_section, relationship,
                                      note, source, source_line, evidence, effective_date, parser_version)
        VALUES (${p.oldAct}::old_act, ${p.oldSection}, ${p.newAct}::new_act, ${p.newSection},
                ${p.relationship}::statute_relationship, ${p.note}, ${SOURCE_URL[p.pair]}, ${p.sourceLine},
                ${p.evidence}, ${effective}::date, ${PARSER_VERSION})
        ON CONFLICT (old_act, old_section, new_act, new_section) DO UPDATE SET
          relationship = EXCLUDED.relationship,
          note = EXCLUDED.note,
          source = EXCLUDED.source,
          source_line = EXCLUDED.source_line,
          evidence = EXCLUDED.evidence,
          effective_date = EXCLUDED.effective_date,
          parser_version = EXCLUDED.parser_version`;
      written++;
    }
    const [count] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM statute_mappings`;
    console.log(`\nWrote ${written} mappings. statute_mappings now holds ${count?.n ?? 0}.`);
    console.log('COVERAGE IS PARTIAL: the absence of a mapping means the parser has not read it, NEVER that no counterpart exists.');
  }
} finally {
  await sql.end();
}
