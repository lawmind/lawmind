/**
 * LCC R16 — MEASUREMENT ONLY. Writes no corpus row, applies no citation edge.
 *
 * THE 78 THAT THE COHORT GATE CANNOT REACH — ASKED OF EVERY FIELD WE ALREADY HOLD.
 *
 * R15-F1 established that of the 180 reachable false uniques, 101 are closed by
 * the corrected gate and 79 are not: 78 where the court printed no conjunction
 * and did not name the sibling, plus 1 line-wrapped year. It then concluded the
 * 78 are UNREACHABLE — but it asked only ONE question of them: does the
 * sibling's case number appear in the bearer's CAUSE TITLE, meaning the first
 * 800 characters.
 *
 * That is a narrower question than "is there authoritative evidence". A common
 * order can name its siblings in the body — `these three petitions are disposed
 * of by this common order` — eight hundred characters below where the cause
 * title ends. And a cohort disposed of by ONE order is frequently ONE document
 * ingested once per matter, which our own provenance columns would record as a
 * shared `content_hash`, `storage_key` or `source_url`.
 *
 * So this asks every already-retained field, and separates two things the
 * previous round did not:
 *
 *   PROSPECTIVE   evidence carried by the BEARER ALONE, before the sibling has
 *                 landed. Only this can ever feed the gate, because at the
 *                 moment of resolution the sibling does not exist for us.
 *   RETROSPECTIVE evidence that needs BOTH rows — a shared content hash. It can
 *                 never drive the gate, and it is measured anyway because it
 *                 says what these documents actually ARE, which is the thing
 *                 R15-F1 asserted without checking.
 *
 * No similarity heuristic. No party name, no date proximity, no judge, no court,
 * no embedding. Every test below is an exact identifier the court or our own
 * fetch recorded.
 *
 *   pnpm exec tsx scripts/lcc-r16-residue.mts
 */
import postgres from 'postgres';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CAUSE_TITLE_CHARS } from '../services/api/src/citations/cohort.ts';

const T0 = '2026-08-18';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 60, connect_timeout: 20 });

const population = JSON.parse(readFileSync('docs/ai/lcc-r16/population.json', 'utf8')) as {
  unreachableKeys: string[];
};
const keys = population.unreachableKeys;

/** `Crl.A. No. 134 of 2018` / `CRLA/134/2018` -> `134|2018`. */
function serialYear(s: string | null): string | null {
  if (!s) return null;
  const m =
    /(\d{1,7})[ \t]*(?:of|\/)[ \t]*((?:19|20)\d{2})\b/i.exec(s) ??
    /(\d{1,7})[ \t]*\/[ \t]*((?:19|20)\d{2})\b/.exec(s);
  if (!m) return null;
  return `${m[1]!.replace(/^0+/, '') || '0'}|${m[2]}`;
}

/**
 * Does `text` print this serial and year as a matter number anywhere?
 *
 * Tolerant of the two layouts a registry actually prints — `134 of 2018` and
 * `134/2018` — and of nothing else. A bare dash is NOT accepted as a separator:
 * `134-2018` is as often a date range or a docket span as a matter number, and
 * this has to be an exact pair of numbers the court printed, not a resemblance.
 *
 * EVERY BACKSLASH HERE IS DOUBLED, and that is the whole point of this round's
 * correction. `scripts/lcc-r15f1-residue.mts` built the same pattern from a
 * template literal with SINGLE backslashes, where `\b` is the backspace
 * character U+0008 and `\s` is the letter `s`. That pattern requires a literal
 * backspace byte in judgment text, so it returned false for every input ever
 * given to it — and it is the test whose silence became "the 78 carry no trace
 * of the sibling at all". A check that cannot fire confirms whatever you hoped.
 */
function printsMatter(text: string, sy: string): boolean {
  const [serial, year] = sy.split('|');
  if (!serial || !year) return false;
  const re = new RegExp(`\\b0*${serial}\\s*(?:of|/)\\s*${year}\\b`, 'i');
  return re.test(text);
}

/** The matched text plus its surroundings, so every positive can be hand-read. */
function contextOf(text: string, sy: string): string | null {
  const [serial, year] = sy.split('|');
  if (!serial || !year) return null;
  const re = new RegExp(`\\b0*${serial}\\s*(?:of|/)\\s*${year}\\b`, 'i');
  const m = re.exec(text);
  if (!m) return null;
  return text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 30).replace(/\s+/g, ' ');
}

type Row = {
  citation_key: string;
  id: string;
  case_number: string | null;
  case_title: string | null;
  content_hash: string | null;
  storage_key: string | null;
  source_url: string | null;
  disposal_nature: string | null;
  cnr: string | null;
  court: string;
  judgment_date: string | null;
  created_at: string;
  full_text: string | null;
};

const all = await sql<Row[]>`
  SELECT k.citation_key, j.id::text, j.case_number, j.case_title, j.content_hash,
         j.storage_key, j.source_url, j.disposal_nature, j.cnr, j.court,
         j.judgment_date::text, k.created_at::text, j.full_text
    FROM judgment_citation_keys k
    JOIN judgments j ON j.id = k.judgment_id
   WHERE k.citation_key = ANY(${keys}::text[])
   ORDER BY k.citation_key, k.created_at`;

const byKey = new Map<string, Row[]>();
for (const r of all) byKey.set(r.citation_key, [...(byKey.get(r.citation_key) ?? []), r]);

type Verdict = {
  citationKey: string;
  bearerId: string;
  siblingIds: string[];
  siblingSerialYears: (string | null)[];
  /** PROSPECTIVE — readable from the bearer alone. */
  siblingNumberInBearerBody: boolean;
  siblingNumberInBearerCauseTitle: boolean;
  bearerCaseNumberNamesSibling: boolean;
  bearerBodyPrintsCommonOrderLanguage: boolean;
  /** RETROSPECTIVE — needs both rows; can never drive the gate. */
  sharedContentHash: boolean;
  sharedStorageKey: boolean;
  sharedSourceUrl: boolean;
  sameCnr: boolean;
  causeTitleContext: string | null;
  bodyContext: string | null;
  classification: string;
};

const COMMON_ORDER =
  /\b(?:common\s+(?:order|judgment|judgement)|disposed\s+of\s+by\s+(?:this|a)\s+common|heard\s+(?:together|analogously)|taken\s+up\s+together|tagged\s+(?:together|with)|analogous(?:ly)?\s+heard|these\s+(?:two|three|four|several|petitions|appeals|applications))\b/i;

const verdicts: Verdict[] = [];

for (const key of keys) {
  const rows = byKey.get(key) ?? [];
  if (rows.length < 2) continue;
  const bearer = rows.find((r) => r.created_at < T0) ?? rows[0]!;
  const siblings = rows.filter((r) => r.id !== bearer.id);
  const body = bearer.full_text ?? '';
  const causeTitle = body.slice(0, CAUSE_TITLE_CHARS);

  const sibSys = siblings.map((s) => serialYear(s.case_number) ?? serialYear(s.case_title));
  /**
   * A sibling sharing the BEARER'S OWN serial is dropped, exactly as R15-F1
   * dropped it. Otherwise the search finds the bearer's own case number printed
   * in its own cause title and reports it as evidence of the sibling — the
   * opposite failure to the one this round is correcting, and just as wrong.
   */
  const bearerSerial = (serialYear(bearer.case_number) ?? serialYear(bearer.case_title))?.split(
    '|',
  )[0];
  const named = sibSys.filter(
    (sy): sy is string => sy !== null && sy.split('|')[0] !== bearerSerial,
  );

  const inBody = named.some((sy) => printsMatter(body, sy));
  const inTitle = named.some((sy) => printsMatter(causeTitle, sy));
  const bearerNames = named.some((sy) => printsMatter(bearer.case_number ?? '', sy));

  const sharedContentHash = siblings.some(
    (s) => s.content_hash !== null && s.content_hash === bearer.content_hash,
  );
  const sharedStorageKey = siblings.some(
    (s) => s.storage_key !== null && s.storage_key === bearer.storage_key,
  );
  const sharedSourceUrl = siblings.some(
    (s) => s.source_url !== null && s.source_url === bearer.source_url,
  );
  const sameCnr = siblings.some((s) => s.cnr !== null && s.cnr === bearer.cnr);

  const classification =
    named.length === 0
      ? 'AMBIGUOUS_SOURCE'
      : inBody || bearerNames
        ? 'EXISTING_AUTHORITATIVE_SIGNAL_AVAILABLE'
        : sharedContentHash || sharedStorageKey || sharedSourceUrl || sameCnr
          ? 'RETROSPECTIVE_SIGNAL_ONLY'
          : 'NO_AUTHORITATIVE_SIGNAL_AVAILABLE';

  verdicts.push({
    citationKey: key,
    bearerId: bearer.id,
    siblingIds: siblings.map((s) => s.id),
    siblingSerialYears: sibSys,
    siblingNumberInBearerBody: inBody,
    siblingNumberInBearerCauseTitle: inTitle,
    bearerCaseNumberNamesSibling: bearerNames,
    bearerBodyPrintsCommonOrderLanguage: COMMON_ORDER.test(body),
    causeTitleContext: named.map((sy) => contextOf(causeTitle, sy)).find((c) => c !== null) ?? null,
    bodyContext: named.map((sy) => contextOf(body, sy)).find((c) => c !== null) ?? null,
    sharedContentHash,
    sharedStorageKey,
    sharedSourceUrl,
    sameCnr,
    classification,
  });
}

const tally = (f: (v: Verdict) => boolean) => verdicts.filter(f).length;
const byClass: Record<string, number> = {};
for (const v of verdicts) byClass[v.classification] = (byClass[v.classification] ?? 0) + 1;

const out = {
  measuredAt: new Date().toISOString(),
  t0: T0,
  scope: 'the unreachable residue from docs/ai/lcc-r16/population.json',
  KEYS_EXAMINED: verdicts.length,
  prospective: {
    SIBLING_NUMBER_IN_BEARER_CAUSE_TITLE: tally((v) => v.siblingNumberInBearerCauseTitle),
    SIBLING_NUMBER_ANYWHERE_IN_BEARER_BODY: tally((v) => v.siblingNumberInBearerBody),
    BEARER_CASE_NUMBER_NAMES_SIBLING: tally((v) => v.bearerCaseNumberNamesSibling),
    BEARER_BODY_PRINTS_COMMON_ORDER_LANGUAGE: tally((v) => v.bearerBodyPrintsCommonOrderLanguage),
  },
  retrospective: {
    SHARED_CONTENT_HASH: tally((v) => v.sharedContentHash),
    SHARED_STORAGE_KEY: tally((v) => v.sharedStorageKey),
    SHARED_SOURCE_URL: tally((v) => v.sharedSourceUrl),
    SAME_CNR: tally((v) => v.sameCnr),
  },
  SIBLING_NUMBER_UNPARSEABLE: tally((v) => v.siblingSerialYears.every((s) => s === null)),
  SIBLING_SHARES_BEARER_SERIAL_EXCLUDED: tally((v) => v.siblingSerialYears.length > 0 && v.bodyContext === null && v.causeTitleContext === null && v.siblingNumberInBearerBody === false),
  classification: byClass,
  verdicts,
};

console.log(`KEYS_EXAMINED                             ${verdicts.length}`);
console.log('\n── PROSPECTIVE (bearer alone — the only kind the gate could use) ──');
console.log(`sibling number in bearer CAUSE TITLE      ${out.prospective.SIBLING_NUMBER_IN_BEARER_CAUSE_TITLE}`);
console.log(`sibling number ANYWHERE in bearer body    ${out.prospective.SIBLING_NUMBER_ANYWHERE_IN_BEARER_BODY}`);
console.log(`bearer case_number names the sibling      ${out.prospective.BEARER_CASE_NUMBER_NAMES_SIBLING}`);
console.log(`bearer body prints common-order language  ${out.prospective.BEARER_BODY_PRINTS_COMMON_ORDER_LANGUAGE}`);
console.log('\n── RETROSPECTIVE (needs both rows — can never drive the gate) ──');
console.log(`shared content_hash                       ${out.retrospective.SHARED_CONTENT_HASH}`);
console.log(`shared storage_key                        ${out.retrospective.SHARED_STORAGE_KEY}`);
console.log(`shared source_url                         ${out.retrospective.SHARED_SOURCE_URL}`);
console.log(`same cnr                                  ${out.retrospective.SAME_CNR}`);
console.log(`\nsibling case number unparseable           ${out.SIBLING_NUMBER_UNPARSEABLE}`);
console.log('\nclassification:', JSON.stringify(byClass, null, 1));

mkdirSync('docs/ai/lcc-r16', { recursive: true });
writeFileSync('docs/ai/lcc-r16/residue.json', JSON.stringify(out, null, 2) + '\n');
console.log('\nwrote docs/ai/lcc-r16/residue.json');
await sql.end();
