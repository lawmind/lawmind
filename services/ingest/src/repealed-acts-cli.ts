/**
 * `pnpm --filter @lawmind/ingest repealed [--act ipc] [--dry]`
 *
 * Fetch a repealed code's PDF from India Code, cut it into sections, and report
 * what came out. **Dry by default** — the parse is the risky part and it should
 * be read by a person before anything is stored.
 *
 * `DOMAIN_TRUTH.md`: never invent a section number. So this prints counts,
 * gaps and samples, and a human decides whether the parse is trustworthy before
 * `--write` is added to it.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import { REPEALED_ACT_HANDLES, compareSectionNumbers, parseSections } from './repealed-acts.ts';

const INDIA_CODE = 'https://www.indiacode.nic.in';

const wanted = process.argv.includes('--act')
  ? process.argv[process.argv.indexOf('--act') + 1]
  : undefined;

const acts = REPEALED_ACT_HANDLES.filter((a) => wanted === undefined || a.oldAct === wanted);
if (acts.length === 0) {
  console.error(`unknown --act. One of: ${REPEALED_ACT_HANDLES.map((a) => a.oldAct).join(', ')}`);
  process.exit(2);
}

/**
 * India Code rate-limits and answers with a 403 HTML page rather than a status,
 * which `services/ingest/src/indiacode.ts` already records. One request per act
 * here, spaced, because three PDFs is not a harvest.
 */
async function fetchPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'user-agent': 'Lawmind-Ingest/1.0' } });
  if (!res.ok) throw new Error(`http ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

for (const act of acts) {
  console.log('='.repeat(74));
  console.log(`${act.shortTitle}  ·  handle ${act.handle}`);

  // The item page carries exactly one bitstream. Read it rather than guessing
  // the filename — the IPC's contains a comma and a space, url-encoded.
  const page = await fetch(`${INDIA_CODE}/handle/${act.handle}`, {
    headers: { 'user-agent': 'Lawmind-Ingest/1.0' },
  }).then((r) => r.text());

  const title = /<title>([^<]*)<\/title>/i.exec(page)?.[1] ?? '';
  if (!title.toLowerCase().includes(act.expectTitle.toLowerCase().slice(0, 12))) {
    console.error(`  REFUSED: handle returned "${title.trim()}", expected ${act.expectTitle}`);
    console.error('  A handle that resolves to the wrong Act is how a corpus gets the wrong law.');
    continue;
  }

  const bitstream = /href="(\/bitstream\/[^"]+\.pdf)"/i.exec(page)?.[1];
  if (!bitstream) {
    console.error('  REFUSED: no PDF bitstream on the item page.');
    continue;
  }

  const bytes = await fetchPdf(INDIA_CODE + bitstream);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });

  const sections = parseSections(text).sort((a, b) => compareSectionNumbers(a.number, b.number));

  console.log(`  pdf            ${(bytes.length / 1024).toFixed(0)} KB, ${pdf.numPages} pages`);
  console.log(`  text           ${text.length.toLocaleString('en-IN')} chars`);
  console.log(`  sections       ${sections.length}`);

  if (sections.length === 0) {
    console.log('  NOTHING PARSED — the heading rule does not match this Act’s typesetting.');
    console.log('  That is a finding, not a reason to loosen the rule.');
    continue;
  }

  const numeric = sections
    .map((s) => Number.parseInt(s.number, 10))
    .filter((n) => !Number.isNaN(n));
  const highest = Math.max(...numeric);
  const present = new Set(numeric);
  const missing: number[] = [];
  for (let n = 1; n <= highest; n++) if (!present.has(n)) missing.push(n);

  console.log(`  range          1 – ${highest}`);
  console.log(
    `  gaps           ${missing.length}` +
      (missing.length > 0 ? ` · first few: ${missing.slice(0, 12).join(', ')}` : ''),
  );

  /**
   * Gaps are expected and are not automatically a parse failure — a repealed
   * section is genuinely absent from the printed Act. **But a large gap count
   * is how a broken heading rule looks**, so it is printed rather than
   * summarised away, and a human reads it.
   */
  const median = sections.map((s) => s.text.length).sort((a, b) => a - b)[
    Math.floor(sections.length / 2)
  ];
  console.log(`  median length  ${median} chars`);

  console.log('');
  for (const s of sections.slice(0, 3)) {
    console.log(`  § ${s.number}  ${s.heading}`);
    console.log(`      ${s.text.slice(0, 160)}…`);
  }
  console.log('');
  console.log('  DRY — nothing written. Read the samples and the gap count before storing.');
}
