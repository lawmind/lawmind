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
const UA = 'LawMind-research/1.0 (statute source verification; one request at a time)';

type Bitstream = { url: string; bytes: number; md5: string };
type ActSpec = {
  /** CLI selector. */
  key: string;
  outJson: string;
  cache: string;
  /** The Act's own published section count. */
  publishedSections: number;
  /** Below this the artifact is a summary or a table of contents, not the Act. */
  minSections: number;
  /** Where the section text is taken from. Always the AMENDED edition. */
  ingest: { itemUuid: string; handle: string; page: string; pdfName: string; pdfBytes: number; pdfMd5: string; text: Bitstream; secondItem?: string };
  /**
   * An independent byte-identical copy from a second government platform, when
   * one exists. It proves identity; it is NOT the text source. `null` is an
   * honest state and is recorded as such rather than papered over.
   */
  control: { label: string; url: string; bytes: number; md5: string; sha256: string; indiaCodeItem: { uuid: string; handle: string; page: string; actId: string; stateName: string; text: Bitstream } } | null;
  /** Sections an advocate uses daily — printed every run, never inferred. */
  spotChecks: number[];
  /** One section that must exist only in the amended edition, when a control exists. */
  amendedWitness: string | null;
  row: { actId: string; shortTitle: string; actNumber: string; actYear: number; enactmentDate: string; enforcementDate: string; ministry: string };
  currency: { repealedBy: string; repealedFrom: string };
};

/**
 * THE EDITION QUESTION, decided by measurement rather than by which file was
 * easiest to verify.
 *
 * For CrPC the MHA copy is byte-perfect and cross-checksummed, and it is also an
 * OLD EDITION: measured against the other derivative it has **no s.436A**
 * (default bail, Act 25 of 2005), **no s.166A** (Act 5 of 2009) and **no
 * s.357B/357C** (Act 13 of 2013). An advocate looking up default bail would find
 * nothing.
 *
 * So the ingest source is always the AMENDED edition, and a byte-verifiable copy
 * is kept as an identity control where one exists. **Verifiability decides
 * whether a file may be used; it does not decide which edition is the law.**
 */
const ACTS: ActSpec[] = [
  {
    key: 'crpc',
    outJson: 'docs/ai/new2-r83/crpc-1973-acquisition.json',
    cache: join(ROOT, '.cache', 'n2-crpc-1973'),
    publishedSections: 484,
    minSections: 470,
    ingest: {
      itemUuid: '02baf368-ffdf-459c-a189-e4819e0b833c',
      handle: '123456789/549163',
      page: 'https://indiacode.gov.in/handle/123456789/549163',
      pdfName: 'crpc.pdf',
      pdfBytes: 1559752,
      pdfMd5: '5a1bec6fe3568012207ee638141fc265',
      text: {
        url: 'https://indiacode.gov.in/server/api/core/bitstreams/617b8548-fc73-4e7b-97dd-a888ca539445/content',
        bytes: 795364,
        md5: '6f3b8930a4936fe9deaf4a64238fad9c',
      },
      /** The identical PDF and text MD5s also appear under item 65ae197e (Tripura). */
      secondItem: '65ae197e-06e1-4b83-a2c4-79fffb837967',
    },
    control: {
      label: 'Ministry of Home Affairs, Judicial Division Acts listing',
      url: 'https://www.mha.gov.in/sites/default/files/2022-09/ccp1973%5B1%5D.pdf',
      bytes: 643659,
      md5: 'd6ff18c7af47a78f13c59ca72b4fb128',
      sha256: '391aa2b4881a8e6c33e24445e230b4ba6b0db78d8d99a8399a1a60a1713eaf48',
      indiaCodeItem: {
        uuid: '330a1099-77ad-4a2e-b22a-769b33398f9e',
        handle: '123456789/547526',
        page: 'https://indiacode.gov.in/handle/123456789/547526',
        actId: 'AC_CH_60_1033_00002_00002_1598416404754',
        stateName: 'Chandigarh',
        text: {
          url: 'https://indiacode.gov.in/server/api/core/bitstreams/f9f5de23-7e0b-4c4b-8acb-16964ccdb765/content',
          bytes: 876721,
          md5: 'cb10172032f80c925e4580c58e8a29e5',
        },
      },
    },
    spotChecks: [41, 125, 154, 161, 173, 197, 227, 313, 357, 397, 437, 438, 439, 468, 482, 484],
    amendedWitness: '436A',
    row: {
      // NOT India Code's `AC_CH_…`, which belongs to a Chandigarh repository
      // entry: stamping it on the central Act would record the wrong provenance
      // in the one column meant to carry it. The control bytes are MHA's.
      actId: 'MHA_JUD_2022-09_ccp1973',
      shortTitle: 'The Code of Criminal Procedure, 1973',
      actNumber: '2',
      actYear: 1974,
      enactmentDate: '1974-01-25',
      // s.1(3) of the Act itself: "It shall come into force on the 1st day of
      // April, 1974." Read off the artifact, not off anyone's memory.
      enforcementDate: '1974-04-01',
      ministry: 'Ministry of Home Affairs',
    },
    currency: { repealedBy: 'Bharatiya Nagarik Suraksha Sanhita, 2023 (Act 46 of 2023)', repealedFrom: '2024-07-01' },
  },
  {
    key: 'ipc',
    outJson: 'docs/ai/new2-r83/ipc-1860-acquisition.json',
    cache: join(ROOT, '.cache', 'n2-ipc-1860'),
    publishedSections: 511,
    minSections: 470,
    ingest: {
      itemUuid: '06909787-e38f-44a0-bf46-8cb0a3405a45',
      handle: '123456789/547812',
      page: 'https://indiacode.gov.in/handle/123456789/547812',
      pdfName: 'ipc_act.pdf',
      pdfBytes: 1529218,
      pdfMd5: 'ebeeb16efdb9b79ff34289dbcb479643',
      text: {
        url: 'https://indiacode.gov.in/server/api/core/bitstreams/5d3f98b8-a7c9-4723-bef8-96956c6128c3/content',
        bytes: 471165,
        md5: 'ed2abbb10c60b15617a9d4616308f384',
      },
    },
    /**
     * NO byte-identical second source was found for the IPC, and that is
     * recorded rather than substituted for. The CENTRAL item `972afbe0`
     * (`A1860-45.pdf`, 1,104,850 B) is a different file, and its text derivative
     * is truncated at exactly 100,000 characters — 81 of 511 sections. So the
     * IPC ingest rests on ONE platform's checksum, which is weaker evidence than
     * the CrPC's two, and the artifact says so.
     */
    control: null,
    spotChecks: [34, 120, 149, 300, 302, 304, 307, 323, 376, 406, 420, 498, 511],
    amendedWitness: null,
    row: {
      actId: 'INDIACODE_547812_ipc_act',
      shortTitle: 'The Indian Penal Code, 1860',
      actNumber: '45',
      actYear: 1860,
      enactmentDate: '1860-10-06',
      enforcementDate: '1862-01-01',
      ministry: 'Ministry of Home Affairs',
    },
    currency: { repealedBy: 'Bharatiya Nyaya Sanhita, 2023 (Act 45 of 2023)', repealedFrom: '2024-07-01' },
  },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchCached(cache: string, name: string, url: string): Promise<Buffer> {
  mkdirSync(cache, { recursive: true });
  const path = join(cache, name);
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
function parse(text: string, spec: ActSpec): Parsed {
  // These editions open with ARRANGEMENT OF SECTIONS — a complete table of
  // contents for an Act the body may or may not contain in full. That is the
  // exact shape that scored the IPC at "100% complete" on a file holding 18%,
  // so the body is taken from the `ACT NO.` line onward and the TOC is
  // discarded, never counted.
  const bodyAt = text.indexOf('\nACT NO');
  const body = bodyAt > 0 ? text.slice(bodyAt) : text;
  // CrPC ends at THE FIRST SCHEDULE; the IPC has no schedule and simply ends.
  const cut = /\nTHE (?:FIRST )?SCHEDULE\s*\n/.exec(body);
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
  // The period after the number is OPTIONAL when a footnote bracket opens the
  // line. IPC s.17 prints `[17 “Government”.—The word…` with no period at all —
  // the bracket swallowed it — and a period-required rule scored it absent from
  // a file that defines it.
  const re = /\n[ \t]{0,6}(?:\d{0,2}\[)?(\d{1,3}[A-Z]{0,2})\.?[ \t]{0,3}(?=[A-Z“(])/g;
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
    if (n !== null && n >= 1 && n <= spec.publishedSections) bare.add(n);
    else if (/[A-Z]/.test(sec)) lettered.push(sec);
    else continue; // a page number or a stray ordinal, not a section
    sections.push({
      sectionNumber: sec,
      heading,
      sectionText: cleaned,
      footnote: null,
      orderIndex: order++,
      sourceUrl: spec.ingest.page,
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

async function acquire(spec: ActSpec, apply: boolean): Promise<void> {
  console.log(`=== ${spec.key.toUpperCase()} — ${spec.row.shortTitle}${apply ? '  (APPLY)' : '  (dry run)'}`);

  // ---- the identity control, when one exists ----------------------------
  let controlBuf: Buffer | null = null;
  let controlOk = true;
  let crossOk = true;
  let pdfOk = true;
  let pdfMd5 = '';
  let pdfSha = '';
  let pdfLen = 0;
  if (spec.control) {
    const pdf = await fetchCached(spec.cache, 'control.pdf', spec.control.url);
    pdfLen = pdf.length;
    pdfMd5 = digest(pdf, 'md5');
    pdfSha = digest(pdf, 'sha256');
    pdfOk = pdf.length === spec.control.bytes && pdfMd5 === spec.control.md5 && pdfSha === spec.control.sha256;
    console.log(`  control pdf    ${pdf.length} B  md5 ${pdfMd5}  ${pdfOk ? 'MATCH' : 'MISMATCH'}  (${spec.control.label})`);
    crossOk = pdfMd5 === spec.control.md5 && pdf.length === spec.control.bytes;
    console.log(`  two-source identity  ${crossOk ? 'CONFIRMED' : 'FAILED'} — India Code independently records the same md5 and byte count`);

    controlBuf = await fetchCached(spec.cache, 'control.txt', spec.control.indiaCodeItem.text.url);
    const controlMd5 = digest(controlBuf, 'md5');
    controlOk = controlBuf.length === spec.control.indiaCodeItem.text.bytes && controlMd5 === spec.control.indiaCodeItem.text.md5;
    console.log(`  control text   ${controlBuf.length} B  md5 ${controlMd5}  ${controlOk ? 'MATCH' : 'MISMATCH'}`);
  } else {
    console.log('  control        NONE — no byte-identical second source found; this rests on ONE platform');
  }

  // ---- the ingest source ------------------------------------------------
  const txtBuf = await fetchCached(spec.cache, 'ingest.txt', spec.ingest.text.url);
  const txtMd5 = digest(txtBuf, 'md5');
  const txtOk = txtBuf.length === spec.ingest.text.bytes && txtMd5 === spec.ingest.text.md5;
  console.log(`  INGEST text    ${txtBuf.length} B  md5 ${txtMd5}  ${txtOk ? 'MATCH' : 'MISMATCH'}  (item ${spec.ingest.handle})`);

  const { sections, bare, lettered, principalChars } = parse(txtBuf.toString('utf8'), spec);
  console.log(`  principal Act  ${principalChars.toLocaleString()} chars`);
  console.log(`  parsed         ${sections.length} sections — ${bare.size} of ${spec.publishedSections} bare (${((bare.size / spec.publishedSections) * 100).toFixed(1)}%), ${lettered.length} lettered`);
  const missing: number[] = [];
  for (let i = 1; i <= spec.publishedSections; i++) if (!bare.has(i)) missing.push(i);

  // A missing section is not automatically a parse failure. These editions
  // print repealed sections as `13. [Definition of "Queen".] Omitted by the
  // A. O. 1950.` — a heading in square brackets with no body — so the section
  // is ABSENT FROM THE ACT, not absent from our reading of it. Separating the
  // two is the difference between "our parser lost 19 sections" and "Parliament
  // repealed 19 sections", and only one of those is a defect.
  const full = txtBuf.toString('utf8');
  // The `Rep. by …` note sometimes lands on the NEXT line — s.492's does — so
  // the marker is looked for across the wrap rather than on one line.
  const repealed = missing.filter((n) =>
    new RegExp(`(^|\\n)[ \\t]{0,8}(?:\\d{0,2}\\[)?${n}\\.[ \\t]*\\[[^\\]]{0,300}\\][\\s\\S]{0,120}?(Omitted|Rep\\.|Repealed)`, 'i').test(full),
  );
  const unexplained = missing.filter((n) => !repealed.includes(n));
  console.log(`  missing bare   ${missing.length} — ${repealed.length} printed as repealed/omitted by the Act itself, ${unexplained.length} unexplained`);
  if (unexplained.length) console.log(`    unexplained: ${unexplained.slice(0, 40).join(',')}`);

  const byNum = new Map(sections.map((s) => [s.sectionNumber, s]));
  console.log('  spot checks:');
  for (const n of spec.spotChecks) {
    const s = byNum.get(String(n));
    console.log(`    s.${String(n).padEnd(4)} ${s ? String(s.sectionText.length).padStart(6) + ' chars  ' + (s.heading ?? '(no heading)') : 'ABSENT'}`);
  }

  // The shortest rows are where a page number or a stray ordinal would hide if
  // one had been parsed as a section, so they are printed rather than trusted.
  const shortest = [...sections].sort((a, b) => a.sectionText.length - b.sectionText.length).slice(0, 5);
  console.log('  shortest parsed (where a false positive would hide):');
  for (const s of shortest) {
    console.log(`    s.${s.sectionNumber.padEnd(5)} ${String(s.sectionText.length).padStart(4)} chars  ${JSON.stringify(s.sectionText.slice(0, 78))}`);
  }

  // The edition delta, measured rather than asserted, whenever a control exists.
  let onlyInAmended: string[] = [];
  if (controlBuf) {
    const controlSecs = new Set(
      [...controlBuf.toString('utf8').matchAll(/\n[ \t]*\n[ \t]{0,10}(?:\d{0,2}\*?\[)?(\d{1,3}[A-Z]{0,2})\.[ \t]{0,10}(?=[A-Z(])/g)].map((x) => x[1]!),
    );
    onlyInAmended = sections.map((s) => s.sectionNumber).filter((s) => !controlSecs.has(s)).sort();
    console.log(`  edition delta  ${onlyInAmended.length} sections in the amended text and NOT in the control edition`);
    console.log(`    ${onlyInAmended.join(', ')}`);
  }

  const act: ActRecord = {
    actId: spec.row.actId,
    shortTitle: spec.row.shortTitle,
    hindiTitle: null,
    actNumber: spec.row.actNumber,
    actYear: spec.row.actYear,
    enactmentDate: spec.row.enactmentDate,
    enforcementDate: spec.row.enforcementDate,
    ministry: spec.row.ministry,
    sourceUrl: spec.ingest.page,
  } as ActRecord;

  const gates: Record<string, boolean> = {
    ingest_text_checksum: txtOk,
    section_recall: bare.size >= spec.minSections,
    // Every gap must be explained by the Act's own text, never by our parser.
    all_gaps_explained: unexplained.length === 0,
  };
  if (spec.control) {
    gates['control_checksum'] = pdfOk;
    gates['two_source_identity'] = crossOk;
    gates['control_text_checksum'] = controlOk;
  }
  if (spec.amendedWitness) gates['amended_edition'] = onlyInAmended.includes(spec.amendedWitness);
  const allOk = Object.values(gates).every(Boolean);
  console.log(`  gates: ${Object.entries(gates).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join('  ')}`);

  mkdirSync(join(ROOT, dirname(spec.outJson)), { recursive: true });
  writeFileSync(
    join(ROOT, spec.outJson),
    JSON.stringify(
      {
        artifact: `NEW2_${spec.key.toUpperCase()}_ACQUISITION`,
        lane: 'NEW2',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §11 N2-5 / N2-6',
        generated_at: new Date().toISOString(),
        verdict: allOk ? 'AVAILABLE_COMPLETE' : 'BLOCKED_BY_GATE',
        act: { ...act },
        ingest_source: {
          role: 'the amended edition — the text actually written to statute_sections',
          ...spec.ingest,
          observed_text_bytes: txtBuf.length,
          observed_text_md5: txtMd5,
        },
        identity_control: spec.control
          ? {
              role: 'byte-verifiable copy from a second government platform; proves identity, NOT the text source',
              ...spec.control,
              observed_bytes: pdfLen,
              observed_md5: pdfMd5,
              observed_sha256: pdfSha,
            }
          : {
              role: 'NONE',
              note: 'no byte-identical second source was found, so this acquisition rests on one platform checksum — weaker evidence than a cross-checked one, and recorded as such',
            },
        edition_delta: { sections_only_in_amended: onlyInAmended },
        parse: {
          principal_chars: principalChars,
          sections_parsed: sections.length,
          bare_sections: bare.size,
          published_sections: spec.publishedSections,
          lettered: lettered.sort(),
          missing_bare: missing,
          missing_but_printed_repealed: repealed,
          missing_unexplained: unexplained,
        },
        gates,
        currency: {
          repealed_by: spec.currency.repealedBy,
          repealed_from: spec.currency.repealedFrom,
          basis: 'DOMAIN_TRUTH.md',
          source_metadata_says: 'repealed: false — WRONG, and not propagated',
          note: 'ingested as the law that governs pre-1-July-2024 conduct, never as current law',
        },
        applied: false,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`  wrote ${spec.outJson}`);

  if (!apply) {
    console.log('  dry run — nothing written to statutes/statute_sections.\n');
    return;
  }
  if (!allOk) {
    console.error('  REFUSING to write: a gate failed.\n');
    process.exitCode = 1;
    return;
  }

  const sql = await openDb(process.env['DATABASE_URL']!, 2);
  try {
    const res = await upsertAct(sql, act, sections);
    const [check] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM statute_sections WHERE statute_id = ${res.statuteId}
    `;
    console.log(`  wrote statute ${res.statuteId} with ${res.sections} sections; verified by re-read: ${check?.n} rows\n`);
    const json = JSON.parse(readFileSync(join(ROOT, spec.outJson), 'utf8'));
    json.applied = true;
    json.statute_id = res.statuteId;
    json.sections_written = res.sections;
    json.verified_rows = Number(check?.n ?? 0);
    writeFileSync(join(ROOT, spec.outJson), JSON.stringify(json, null, 1) + '\n');
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const want = process.argv.find((a) => a.startsWith('--act='))?.slice(6);
  const chosen = want ? ACTS.filter((a) => a.key === want) : ACTS;
  if (chosen.length === 0) {
    console.error(`unknown --act=${want}. Known: ${ACTS.map((a) => a.key).join(', ')}`);
    process.exitCode = 2;
    return;
  }
  console.log('R8.3 §11 N2-5 / N2-6 — statute acquisition\n');
  for (const spec of chosen) await acquire(spec, apply);
}

await main();
