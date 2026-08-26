/**
 * NEW2 — R8.3 §11 N2-5. Acquire the Code of Criminal Procedure, 1973 from a
 * primary Government of India source, and reopen my own `CONFIRMED_ABSENT`.
 *
 * ## Why the previous verdict was wrong
 *
 * R8.1 recorded CrPC 1973 as `CONFIRMED_ABSENT` on India Code. Three search
 * paths agreed, and all three were run against a platform that had moved:
 * `www.indiacode.nic.in` now serves a **site-migration redirect** to
 * `indiacode.gov.in`, and every legacy `/handle/...` deep link 404s — including
 * the three handles `services/ingest/src/statutes.ts` still carries for BNS,
 * BNSS and BSA. An absence proved over a dead host is a fact about the host.
 *
 * On the live platform the Act is there. It is filed under STATE Acts
 * collections rather than CENTRAL, which is why a CENTRAL-scoped principal-Act
 * filter returned 1861/1872/1882/1898 and stopped.
 *
 * ## What makes this artifact identifiable rather than merely titled
 *
 * Two independent official sources, and a checksum that ties them:
 *
 * - the **Ministry of Home Affairs** — the ministry that administers the Code —
 *   serves `ccp1973.pdf` from its Judicial Division Acts listing;
 * - **India Code** item `123456789/547526` records an ORIGINAL bitstream of the
 *   same name whose published MD5 and byte count match the MHA file EXACTLY.
 *
 * So the bytes come from MHA and are verified against a second government
 * platform's independently published checksum.
 *
 * ## Why the text comes from the India Code derivative and not from the PDF
 *
 * India Code publishes a text layer for that bitstream, and its MD5 is
 * verifiable against the platform's own record. Extracting text ourselves would
 * introduce an extractor whose recall is `NOT_MEASURED` (and `poppler deletes
 * Devanagari` is a defect this corpus has already paid for). The derivative is
 * verified input; our own extraction would be unverified input.
 *
 * **The 100,000-character trap is real and this run proves it precisely.** The
 * SAME PDF (MD5 `d6ff18c7…`) carries two different text derivatives on India
 * Code: 876,721 characters under item `547526`, and exactly 100,000 characters
 * under item `550879`. The truncated one holds 18.0% of the Act while listing a
 * complete table of contents. R8.1 called that cap a platform rule; it is a
 * per-item property, and the identical PDF is the control that shows it.
 *
 * ## What this script refuses to do
 *
 * - it will not write if either checksum fails;
 * - it will not write if fewer than {@link MIN_SECTIONS} of the Act's 484
 *   sections parse with body text — a table of contents must never be ingested
 *   as an Act;
 * - it will not write a repeal status. The source's own metadata says
 *   `repealed: false`, which is wrong as legal fact: BNSS (Act 46 of 2023)
 *   replaced the Code on 1 July 2024 per `DOMAIN_TRUTH.md`. Source metadata
 *   does not get to overwrite domain truth, and this script does not carry a
 *   currency claim into the row at all.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-crpc-1973-acquire.mts
 *   services/ingest/node_modules/.bin/tsx scripts/n2-crpc-1973-acquire.mts --apply
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from '../services/ingest/src/db-host.ts';
import { upsertAct } from '../services/ingest/src/statutes.ts';
import type { ActRecord, SectionRecord } from '../services/ingest/src/indiacode.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = 'docs/ai/new2-r83/crpc-1973-acquisition.json';
const CACHE = join(ROOT, '.cache', 'n2-crpc-1973');

const UA = 'LawMind-research/1.0 (statute source verification; one request at a time)';

/** The Act's published section count. 484 is the Code's own final section. */
const PUBLISHED_SECTIONS = 484;
/** Below this, the artifact is a summary or a table of contents, not the Act. */
const MIN_SECTIONS = 470;

/**
 * THE EDITION QUESTION, decided by measurement rather than by which file was
 * easiest to verify.
 *
 * The MHA copy is byte-perfect and cross-checksummed, and it is also an OLD
 * EDITION. Measured against the other derivative it has **no s.436A** (default
 * bail, inserted by Act 25 of 2005), **no s.166A** (Act 5 of 2009) and **no
 * s.357B/357C** (Act 13 of 2013). An advocate looking up default bail would
 * find nothing, and s.24 would return its pre-amendment text.
 *
 * So the ingest source is the AMENDED edition and the MHA file is kept as an
 * identity control. Verifiability decides *whether* a file may be used; it does
 * not decide *which edition is the law*.
 */
const AMENDED = {
  itemUuid: '02baf368-ffdf-459c-a189-e4819e0b833c',
  handle: '123456789/549163',
  page: 'https://indiacode.gov.in/handle/123456789/549163',
  pdf: { name: 'crpc.pdf', bytes: 1559752, md5: '5a1bec6fe3568012207ee638141fc265' },
  text: {
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/617b8548-fc73-4e7b-97dd-a888ca539445/content',
    bytes: 795364,
    md5: '6f3b8930a4936fe9deaf4a64238fad9c',
  },
  /** The identical PDF and text MD5s also appear under item 65ae197e (Tripura). */
  secondItem: '65ae197e-06e1-4b83-a2c4-79fffb837967',
};

/** Bytes from the administering ministry — the identity control, not the text source. */
const MHA = {
  url: 'https://www.mha.gov.in/sites/default/files/2022-09/ccp1973%5B1%5D.pdf',
  bytes: 643659,
  md5: 'd6ff18c7af47a78f13c59ca72b4fb128',
  sha256: '391aa2b4881a8e6c33e24445e230b4ba6b0db78d8d99a8399a1a60a1713eaf48',
};

/** The same bytes, checksummed independently by a second government platform. */
const INDIA_CODE_ITEM = {
  uuid: '330a1099-77ad-4a2e-b22a-769b33398f9e',
  handle: '123456789/547526',
  page: 'https://indiacode.gov.in/handle/123456789/547526',
  actId: 'AC_CH_60_1033_00002_00002_1598416404754',
  stateName: 'Chandigarh',
  originalMd5: 'd6ff18c7af47a78f13c59ca72b4fb128',
  originalBytes: 643659,
  text: {
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/f9f5de23-7e0b-4c4b-8acb-16964ccdb765/content',
    bytes: 876721,
    md5: 'cb10172032f80c925e4580c58e8a29e5',
  },
};

/**
 * The row identity.
 *
 * NOT the India Code `AC_CH_…` act id: that identifier belongs to a Chandigarh
 * repository entry, and stamping it on the central Act would record the wrong
 * provenance in the one column meant to carry it. The bytes are MHA's, so the
 * id names MHA's own path.
 */
const ACT_ID = 'MHA_JUD_2022-09_ccp1973';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchCached(name: string, url: string): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, name);
  if (existsSync(path)) return readFileSync(path);
  await sleep(1200);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  return buf;
}

function digest(buf: Buffer, algo: 'md5' | 'sha256'): string {
  return createHash(algo).update(buf).digest('hex');
}

type Parsed = { sections: SectionRecord[]; bare: Set<number>; lettered: string[]; principalChars: number };

/**
 * Parse sections out of the verified text derivative.
 *
 * The layout repeats, per section: a bare `N.` line, the heading on its own
 * line, then the body line `      N. Heading. (1) …`. Two spacing facts already
 * cost a false ABSENT each while writing this: `125.Order for maintenance…`
 * has NO space after the period, and `96.     Application…` has five. So the
 * space run is not evidence about the Act, only about the typesetter.
 *
 * The principal Act ends at THE FIRST SCHEDULE; everything after it is the two
 * Schedules and three appended amendment Acts, which are different documents
 * and are not sections of the Code.
 */
function parse(text: string): Parsed {
  // The amended edition opens with ARRANGEMENT OF SECTIONS — a complete table
  // of contents for an Act the body may or may not contain in full. That is the
  // exact shape that scored the IPC at 100% while it held 18%, so the body is
  // taken from `ACT NO. 2 OF 1974` onward and the TOC is discarded, never
  // counted.
  const bodyAt = text.indexOf('\nACT NO. 2 OF 1974');
  const body = bodyAt > 0 ? text.slice(bodyAt) : text;
  const cut = /\nTHE FIRST SCHEDULE\s*\n/.exec(body);
  const principal = cut ? body.slice(0, cut.index) : body;

  // Every section body in this edition reads `N. Heading.—text`. The EM-DASH is
  // the discriminator, and it is a property of the document rather than of a
  // phrase list: a cross-reference ("under section 241") never carries one and
  // a page number never does either.
  //
  // The dash test is `[—–]` and NOT `\.\s?[—–]`, because s.194 prints
  // `…made over to them—As Additional Sessions` with no period at all. The
  // tighter rule scored exactly that one section absent from a file containing
  // it, which is why the looser one is here.
  const re = /\n[ \t]{0,6}(?:\d{0,2}\[)?(\d{1,3}[A-Z]{0,2})\.[ \t]{0,3}(?=[A-Z“(])/g;
  const hits: { sec: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(principal))) {
    const flat = principal.slice(m.index, m.index + 320).replace(/\s+/g, ' ');
    const dash = /[—–]/.exec(flat);
    if (!dash || dash.index > 200) continue;
    hits.push({ sec: m[1]!, at: m.index });
  }

  const best = new Map<string, { start: number; end: number }>();
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.at;
    const end = i + 1 < hits.length ? hits[i + 1]!.at : principal.length;
    const prev = best.get(hits[i]!.sec);
    if (!prev || end - start > prev.end - prev.start) best.set(hits[i]!.sec, { start, end });
  }

  const sections: SectionRecord[] = [];
  const bare = new Set<number>();
  const lettered: string[] = [];
  let order = 0;
  for (const [sec, { start, end }] of best) {
    const raw = principal.slice(start, end);
    // Heading extraction reads the section FLAT, across lines, because these
    // layers hard-wrap: headings break mid-phrase and a same-line rule scored
    // several as headingless. The terminator is the same em-dash that
    // identified the section.
    const afterNum = raw.replace(/^\n[ \t]{0,6}(?:\d{0,2}\[)?\d{1,3}[A-Z]{0,2}\.[ \t]{0,3}/, '');
    const flat = afterNum.slice(0, 400).replace(/\s+/g, ' ').trim();
    const head = /^(.{3,180}?)\.?\s?[—–]/.exec(flat);
    const heading = head?.[1]?.replace(/\.$/, '').trim() ?? null;
    const cleaned = raw.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();
    if (cleaned.length < 40) continue;
    const n = /^\d+$/.test(sec) ? Number(sec) : null;
    if (n !== null && n >= 1 && n <= PUBLISHED_SECTIONS) bare.add(n);
    else if (/[A-Z]/.test(sec)) lettered.push(sec);
    else continue; // a page number or a stray ordinal, not a section
    sections.push({
      sectionNumber: sec,
      heading,
      sectionText: cleaned,
      footnote: null,
      orderIndex: order++,
      sourceUrl: AMENDED.page,
    });
  }
  sections.sort((a, b) => {
    const an = parseInt(a.sectionNumber, 10);
    const bn = parseInt(b.sectionNumber, 10);
    return an - bn || a.sectionNumber.localeCompare(b.sectionNumber);
  });
  sections.forEach((s, i) => { s.orderIndex = i; });
  return { sections, bare, lettered, principalChars: principal.length };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(`R8.3 §11 N2-5 — CrPC 1973 acquisition${apply ? ' (APPLY)' : ' (dry run)'}\n`);

  const pdf = await fetchCached('ccp1973.pdf', MHA.url);
  const pdfMd5 = digest(pdf, 'md5');
  const pdfSha = digest(pdf, 'sha256');
  const pdfOk = pdf.length === MHA.bytes && pdfMd5 === MHA.md5 && pdfSha === MHA.sha256;
  console.log(`MHA pdf        ${pdf.length} B  md5 ${pdfMd5}  ${pdfOk ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  cross-check  India Code records md5 ${INDIA_CODE_ITEM.originalMd5} / ${INDIA_CODE_ITEM.originalBytes} B for the same file`);
  const crossOk = pdfMd5 === INDIA_CODE_ITEM.originalMd5 && pdf.length === INDIA_CODE_ITEM.originalBytes;
  console.log(`  two-source identity  ${crossOk ? 'CONFIRMED' : 'FAILED'}`);

  const controlBuf = await fetchCached('ccp1973.txt', INDIA_CODE_ITEM.text.url);
  const controlMd5 = digest(controlBuf, 'md5');
  const controlOk = controlBuf.length === INDIA_CODE_ITEM.text.bytes && controlMd5 === INDIA_CODE_ITEM.text.md5;
  console.log(`control text   ${controlBuf.length} B  md5 ${controlMd5}  ${controlOk ? 'MATCH' : 'MISMATCH'}  (1974 edition)`);

  const txtBuf = await fetchCached('crpc-amended.txt', AMENDED.text.url);
  const txtMd5 = digest(txtBuf, 'md5');
  const txtOk = txtBuf.length === AMENDED.text.bytes && txtMd5 === AMENDED.text.md5;
  console.log(`INGEST text    ${txtBuf.length} B  md5 ${txtMd5}  ${txtOk ? 'MATCH' : 'MISMATCH'}  (amended edition, item ${AMENDED.handle})`);

  const text = txtBuf.toString('utf8');
  const { sections, bare, lettered, principalChars } = parse(text);
  console.log(`\nprincipal Act  ${principalChars.toLocaleString()} chars (cut at THE FIRST SCHEDULE)`);
  console.log(`parsed         ${sections.length} sections — ${bare.size} of ${PUBLISHED_SECTIONS} bare (${((bare.size / PUBLISHED_SECTIONS) * 100).toFixed(1)}%), ${lettered.length} lettered`);
  const missing: number[] = [];
  for (let i = 1; i <= PUBLISHED_SECTIONS; i++) if (!bare.has(i)) missing.push(i);
  console.log(`missing bare   ${missing.length}${missing.length ? ': ' + missing.join(',') : ''}`);

  const spots = [41, 125, 154, 161, 173, 197, 227, 313, 357, 397, 437, 438, 439, 468, 482, 484];
  const byNum = new Map(sections.map((s) => [s.sectionNumber, s]));
  console.log('\nspot checks:');
  for (const n of spots) {
    const s = byNum.get(String(n));
    console.log(`  s.${String(n).padEnd(4)} ${s ? String(s.sectionText.length).padStart(6) + ' chars  ' + (s.heading ?? '(no heading)') : 'ABSENT'}`);
  }

  // The shortest rows are where a page number or a stray ordinal would hide if
  // one had been parsed as a section, so they are printed rather than trusted.
  const shortest = [...sections].sort((a, b) => a.sectionText.length - b.sectionText.length).slice(0, 6);
  console.log('\nshortest parsed sections (the place a false positive would hide):');
  for (const s of shortest) {
    console.log(`  s.${s.sectionNumber.padEnd(5)} ${String(s.sectionText.length).padStart(4)} chars  ${JSON.stringify(s.sectionText.slice(0, 90))}`);
  }

  // The edition delta, measured rather than asserted: which sections the
  // amended text carries that the 1974 MHA edition does not. This is the whole
  // argument for ingesting the amended one, so it is computed every run.
  const controlSecs = new Set(
    [...controlBuf.toString('utf8').matchAll(/\n[ \t]*\n[ \t]{0,10}(?:\d{0,2}\*?\[)?(\d{1,3}[A-Z]{0,2})\.[ \t]{0,10}(?=[A-Z(])/g)].map((x) => x[1]!),
  );
  const onlyInAmended = sections.map((s) => s.sectionNumber).filter((s) => !controlSecs.has(s)).sort();
  console.log(`\nedition delta  ${onlyInAmended.length} sections in the amended text and NOT in the 1974 MHA edition`);
  console.log(`  ${onlyInAmended.join(', ')}`);

  const act: ActRecord = {
    actId: ACT_ID,
    shortTitle: 'The Code of Criminal Procedure, 1973',
    hindiTitle: null,
    actNumber: '2',
    actYear: 1974,
    enactmentDate: '1974-01-25',
    // s.1(3) of the Act itself: "It shall come into force on the 1st day of
    // April, 1974." Read off the artifact, not off anyone's memory.
    enforcementDate: '1974-04-01',
    ministry: 'Ministry of Home Affairs',
    sourceUrl: AMENDED.page,
  } as ActRecord;

  const gates = {
    control_checksum: pdfOk,
    two_source_identity: crossOk,
    control_text_checksum: controlOk,
    ingest_text_checksum: txtOk,
    section_recall: bare.size >= MIN_SECTIONS,
    amended_edition: onlyInAmended.includes('436A'),
  };
  const allOk = Object.values(gates).every(Boolean);
  console.log(`\ngates: ${Object.entries(gates).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join('  ')}`);

  mkdirSync(join(ROOT, dirname(OUT_JSON)), { recursive: true });
  writeFileSync(
    join(ROOT, OUT_JSON),
    JSON.stringify(
      {
        artifact: 'NEW2_CRPC_1973_ACQUISITION',
        lane: 'NEW2',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §11 N2-5',
        generated_at: new Date().toISOString(),
        supersedes: 'docs/ai/new2-r8/STATUTE_SOURCE_RECONCILIATION_R8.md §4 — CONFIRMED_ABSENT is FALSIFIED',
        verdict: allOk ? 'AVAILABLE_COMPLETE' : 'BLOCKED_BY_GATE',
        act: { ...act },
        ingest_source: {
          role: 'the amended edition — the text actually written to statute_sections',
          ...AMENDED,
          observed_text_bytes: txtBuf.length,
          observed_text_md5: txtMd5,
        },
        identity_control: {
          role: 'byte-verifiable 1974 edition; proves the Act is held by two governments platforms, NOT the text source',
          mha: { ...MHA, observed_bytes: pdf.length, observed_md5: pdfMd5, observed_sha256: pdfSha },
          india_code_item: INDIA_CODE_ITEM,
          observed_text_bytes: controlBuf.length,
          observed_text_md5: controlMd5,
        },
        edition_delta: {
          sections_only_in_amended: onlyInAmended,
          why_it_decided_the_source:
            'the 1974 edition has no s.436A (default bail, Act 25 of 2005), no s.166A (Act 5 of 2009) and no s.357B/357C (Act 13 of 2013)',
        },
        parse: {
          principal_chars: principalChars,
          sections_parsed: sections.length,
          bare_sections: bare.size,
          published_sections: PUBLISHED_SECTIONS,
          lettered: lettered.sort(),
          missing_bare: missing,
        },
        gates,
        currency: {
          repealed_by: 'Bharatiya Nagarik Suraksha Sanhita, 2023 (Act 46 of 2023)',
          repealed_from: '2024-07-01',
          basis: 'DOMAIN_TRUTH.md',
          source_metadata_says: 'repealed: false — WRONG, and not propagated',
          note: 'ingested as the law that governs pre-1-July-2024 conduct, never as current procedure',
        },
        applied: false,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`\nwrote ${OUT_JSON}`);

  if (!apply) {
    console.log('\ndry run — nothing written to statutes/statute_sections. Re-run with --apply.');
    return;
  }
  if (!allOk) {
    console.error('\nREFUSING to write: a gate failed.');
    process.exitCode = 1;
    return;
  }

  const sql = await openDb(process.env['DATABASE_URL']!, 2);
  try {
    const res = await upsertAct(sql, act, sections);
    console.log(`\nwrote statute ${res.statuteId} with ${res.sections} sections`);
    const [check] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM statute_sections WHERE statute_id = ${res.statuteId}
    `;
    console.log(`verified by re-read: ${check?.n} rows`);
    const json = JSON.parse(readFileSync(join(ROOT, OUT_JSON), 'utf8'));
    json.applied = true;
    json.statute_id = res.statuteId;
    json.sections_written = res.sections;
    json.verified_rows = Number(check?.n ?? 0);
    writeFileSync(join(ROOT, OUT_JSON), JSON.stringify(json, null, 1) + '\n');
  } finally {
    await sql.end();
  }
}

await main();
