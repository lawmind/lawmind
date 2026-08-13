/**
 * `pnpm --filter @lawmind/ingest constitution --apply` — loads the Constitution
 * of India into `statutes` / `statute_sections`.
 *
 * NEW3 found the gap (bus 0115) and supplied the source (bus 0143). It is the
 * document every constitutional-bench judgment in this corpus argues about, and
 * until now an advocate searching "Article 21" found nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT FITS THE EXISTING SHAPE RATHER THAN INVENTING ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Constitution is not an Act — it has no act number, no Gazette number, and
 * was not passed by a legislature under a numbering scheme. But `statutes` and
 * `statute_sections` already carry 845 Acts and 34,928 sections, and the whole
 * retrieval and citation surface reads those two tables. Modelling the
 * Constitution separately would mean a second code path for every consumer, for
 * a document that is otherwise exactly "a title with numbered provisions under
 * it". `CLAUDE.md`'s ponytail ladder: the best code is the code you never wrote.
 *
 * So it is stored as one `statutes` row with an honest `act_number` of `0` and
 * an `act_id` that says what it is, and each Article becomes a
 * `statute_sections` row whose `section_number` is the Article number as
 * PRINTED — `21`, `21A`, `371-I` — never renumbered.
 *
 * Dry by default. `--apply` writes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';

import { articleSortKey, parseArticles } from './constitution.ts';

const APPLY = process.argv.includes('--apply');

/**
 * The official Ministry of Law and Justice edition, "As on 1st May 2024",
 * through the 106th Amendment. Served from a Government of India domain --
 * NEW3 established that `indiacode.nic.in` returns 403 to this environment's
 * fetch tooling, and found this mirror of the same document rather than
 * settling for a secondary source.
 */
const SOURCE_URL =
  process.env['CONSTITUTION_URL'] ??
  'https://cdnbbsr.s3waas.gov.in/s380537a945c7aaa788ccfcdf1b99b5d8f/uploads/2024/07/20240716890312078.pdf';

const PDFTOTEXT =
  process.env['PDFTOTEXT_PATH'] ??
  (existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')
    ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe'
    : 'pdftotext');

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('localhost') ? false : 'require',
  max: 2,
  connect_timeout: 120,
});

console.log('THE CONSTITUTION OF INDIA');
console.log('='.repeat(74));
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${SOURCE_URL.slice(0, 62)}…`);

/* ------------------------------------------------------------ fetch + text -- */

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`GET ${SOURCE_URL} → ${res.status}`);
  process.exit(1);
}
const bytes = new Uint8Array(await res.arrayBuffer());
console.log(`fetched ${(bytes.length / 1e6).toFixed(1)} MB`);

/**
 * `-enc UTF-8` is not optional: this is a diglot Hindi/English edition and the
 * default encoding turns every Devanagari character into mojibake. NEW3 hit
 * exactly that and flagged it before I could repeat it.
 */
const dir = mkdtempSync(join(tmpdir(), 'lawmind-coi-'));
let text: string;
try {
  const pdfPath = join(dir, 'coi.pdf');
  writeFileSync(pdfPath, bytes);
  execFileSync(PDFTOTEXT, ['-q', '-enc', 'UTF-8', pdfPath, join(dir, 'coi.txt')], { maxBuffer: 200e6 });
  text = readFileSync(join(dir, 'coi.txt'), 'utf8');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`extracted ${(text.length / 1000).toFixed(0)}k characters`);

/* ----------------------------------------------------------------- parse -- */

const articles = parseArticles(text).sort((a, b) => {
  const [an, as] = articleSortKey(a.number);
  const [bn, bs] = articleSortKey(b.number);
  return an - bn || as.localeCompare(bs);
});

if (articles.length === 0) {
  console.error('parsed ZERO articles — refusing to write. The document shape has changed.');
  process.exit(1);
}

console.log(`parsed ${articles.length} Articles (${articles[0]!.number} → ${articles[articles.length - 1]!.number})`);

/**
 * A SANITY GATE ON THE PARSE ITSELF, because a plausible-looking wrong parse is
 * the failure mode here. An earlier version produced 383 Articles that read
 * fine and had filed a Sixth Schedule paragraph under Article 14. These five
 * are among the most-cited provisions in Indian law; if any of them is missing
 * or mistitled the parse is wrong regardless of how many rows it produced.
 */
const MUST_HAVE: [string, string][] = [
  ['14', 'Equality before law'],
  ['21', 'Protection of life and personal liberty'],
  ['32', 'Remedies for enforcement'],
  ['226', 'Power of High Courts'],
  ['368', 'Power of Parliament to amend'],
];
const failures = MUST_HAVE.filter(([n, t]) => {
  const a = articles.find((x) => x.number === n);
  return !a || !a.title.includes(t);
});
if (failures.length > 0) {
  console.error(`SANITY CHECK FAILED for ${failures.map(([n]) => `Article ${n}`).join(', ')} — refusing to write.`);
  process.exit(1);
}
console.log(`sanity check: all ${MUST_HAVE.length} landmark Articles present and correctly titled`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  await sql.end();
  process.exit(0);
}

/* ----------------------------------------------------------------- write -- */

const ACT_ID = 'CONSTITUTION_OF_INDIA';
const [statute] = await sql<{ id: string }[]>`
  INSERT INTO statutes (act_id, short_title, hindi_title, act_number, act_year,
                        enactment_date, enforcement_date, ministry, source_url)
  VALUES (${ACT_ID}, 'The Constitution of India', 'भारत का संविधान', '0', 1949,
          '1949-11-26', '1950-01-26', 'Ministry of Law and Justice', ${SOURCE_URL})
  ON CONFLICT (act_id) DO UPDATE SET source_url = EXCLUDED.source_url
  RETURNING id`;

const statuteId = statute!.id;
let written = 0;
for (let i = 0; i < articles.length; i += 200) {
  const slice = articles.slice(i, i + 200).map((a, k) => ({
    statute_id: statuteId,
    section_number: a.number,
    heading: a.title.slice(0, 500),
    section_text: a.text,
    order_index: i + k,
    source_url: SOURCE_URL,
  }));
  await sql`
    INSERT INTO statute_sections ${sql(slice)}
    ON CONFLICT (statute_id, section_number) DO UPDATE
      SET heading = EXCLUDED.heading, section_text = EXCLUDED.section_text`;
  written += slice.length;
}

console.log('');
console.log(`WROTE 1 statute row and ${written} Articles as statute_sections.`);
const [check] = await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM statute_sections WHERE statute_id = ${statuteId}`;
console.log(`verified in production: ${check?.n} Articles under "The Constitution of India"`);

await sql.end();
