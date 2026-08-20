/**
 * NEW2 — PDF-NATIVE EVIDENCE FOR THE UNREADABLE TIER-A POPULATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS TESTING, AND WHY AN INFERENCE WAS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `semantic-core-audit-cli.ts` found that 8.3% of the documents the embedding
 * eligibility view ADMITS carry almost no English function words and no
 * Devanagari — text like `74< =7/ 12- <.50 7==-4;-<`, whose only real words are
 * the digital-signature appliance's footer. It is concentrated brutally: 52.6%
 * of Punjab and Haryana's admitted rows and 50.4% of Karnataka's, against under
 * 3% everywhere else.
 *
 * That is a strong inference and it is still an inference. It says the TEXT is
 * not English; it does not say why, and "why" decides what to do about it. Two
 * causes are both consistent with it and they want opposite work:
 *
 *   * the PDF embeds subset fonts with no `/ToUnicode` map, so any extractor
 *     emits raw glyph codes — a re-extraction with a different library changes
 *     nothing and OCR is the only route;
 *   * the PDF is fine and `unpdf` mishandled it — a re-extraction fixes it for
 *     free, and OCR would be a large bill for nothing.
 *
 * So this reads the font dictionaries out of the PDF bytes themselves.
 * `noToUnicode` — the file declares fonts and NOT ONE of them maps to Unicode —
 * is the first cause, stated by the file rather than by us.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT DRAWS A CONTROL GROUP FROM THE SAME COURTS, AND THAT IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A probe that fetched only the suspect documents could report "90% have no
 * ToUnicode map" and mean nothing, because the base rate is unknown — perhaps
 * every PDF this registry publishes is like that and the extraction is fine.
 * So every suspect is matched against readable documents FROM THE SAME COURT,
 * and the number that matters is the SEPARATION between the two groups.
 *
 * This is the same discipline the legacy-font pilot used: its text screen was
 * only believable because it scored zero false positives against 939 documents
 * whose PDFs said they were clean.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED, AND IT WRITES NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `--limit` PDFs at concurrency 4, no database writes, no OCR. A 200-document
 * run is a few minutes of network and nothing else, which is what keeps it a
 * measurement rather than a scheduling decision.
 *
 * A response is only treated as a PDF if its first five bytes are `%PDF-`. The
 * source bucket serves SOFT 404s — HTTP 200, `Content-Type: application/pdf`,
 * body a 124-byte HTML error page — and counting those as font-unreadable PDFs
 * would put a network artefact into a corpus-quality finding.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-unsafe-probe-cli.ts [--courts 3_22,29_3] [--limit 200] \
 *     [--json ../../docs/ops/migration/new2-text-unsafe-probe.json]
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import { MINED_MARKERS, pdfFontEvidence, textSignature } from './legacy-font.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const COURTS = (argOf('courts') ?? '3_22,29_3')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);
const LIMIT = Number(argOf('limit', '200'));
const JSON_OUT = argOf('json');
const CONCURRENCY = 4;

/** Kept identical to the audit's, so the two artifacts partition the same way. */
const ENGLISH_FUNCTION_WORDS =
  /\b(the|of|and|to|in|is|that|for|this|be|by|with|as|it|has|have|not|shall|been|on|are|was|court|petitioner|respondent|order|application|learned|counsel|section|dated|filed|hon)\b/gi;
const ENGLISH_RATE_FLOOR = 12;
const DEVANAGARI = /[ऀ-ॿ]/u;

function englishRate(text: string): number {
  if (text.length === 0) return 0;
  return (1000 * (text.match(ENGLISH_FUNCTION_WORDS) ?? []).length) / text.length;
}

type Candidate = {
  id: string;
  court: string | null;
  source_url: string;
  code: string;
  probe: string;
  textLen: number;
  englishRate: number;
  group: 'suspect' | 'control';
};

const sql = await openDb(url, CONCURRENCY + 1, 5 * 60_000);

/**
 * Draw candidates uniformly from one court and split them by the text screen.
 *
 * The draw is the audit's: `id > $random ORDER BY id LIMIT 1` over a uuid v4 key
 * space. Filtering to a court in SQL and then rejecting on the text in JS keeps
 * the two groups drawn from ONE distribution, which is what makes them
 * comparable — selecting suspects and controls with different queries would
 * compare two populations rather than two halves of one.
 */
async function drawFor(code: string, want: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let attempts = 0;
  const wantEach = Math.ceil(want / 2);
  let suspects = 0;
  let controls = 0;

  while ((suspects < wantEach || controls < wantEach) && attempts < want * 60) {
    attempts++;
    const rows = (await sql`
      SELECT id, court, source_url,
             length(substr(full_text, 1, 200001)) AS text_len,
             substr(full_text, 1, 20000)          AS probe
        FROM judgments
       WHERE id > ${randomUUID()}::uuid
         AND source_url LIKE ${`%/court=${code}/%`}
         AND length(substr(full_text, 1, 2000)) >= 2000
       ORDER BY id
       LIMIT 1`) as unknown as {
      id: string;
      court: string | null;
      source_url: string;
      text_len: number;
      probe: string | null;
    }[];
    const r = rows[0];
    if (!r || !r.probe) continue;
    if (DEVANAGARI.test(r.probe)) continue;
    const rate = englishRate(r.probe);
    const group = rate < ENGLISH_RATE_FLOOR ? 'suspect' : 'control';
    if (group === 'suspect' && suspects >= wantEach) continue;
    if (group === 'control' && controls >= wantEach) continue;
    if (group === 'suspect') suspects++;
    else controls++;
    out.push({
      id: r.id,
      court: r.court,
      source_url: r.source_url,
      code,
      probe: r.probe,
      textLen: r.text_len,
      englishRate: Number(rate.toFixed(2)),
      group,
    });
  }
  console.log(`${code}: drew ${suspects} suspect / ${controls} control in ${attempts} draws`);
  return out;
}

type Result = Candidate & {
  status: number | null;
  isPdf: boolean;
  fontCount: number;
  toUnicodeCount: number;
  noToUnicode: boolean;
  legacyFonts: string[];
  fonts: string[];
  markerRate: number;
  error: string | null;
};

async function probe(c: Candidate): Promise<Result> {
  const base = {
    ...c,
    markerRate: Number(textSignature(c.probe, MINED_MARKERS).markerRate.toFixed(3)),
  };
  try {
    /* 20 seconds. An unbounded fetch inside a bounded probe is how a bounded
     * probe stops being bounded. */
    const res = await fetch(c.source_url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      return {
        ...base,
        status: res.status,
        isPdf: false,
        fontCount: 0,
        toUnicodeCount: 0,
        noToUnicode: false,
        legacyFonts: [],
        fonts: [],
        error: `HTTP ${res.status}`,
      };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    /* The soft 404: 200, application/pdf, an HTML error page. Only the magic
     * bytes disagree, so only the magic bytes are consulted. */
    const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
    if (!isPdf) {
      return {
        ...base,
        status: res.status,
        isPdf: false,
        fontCount: 0,
        toUnicodeCount: 0,
        noToUnicode: false,
        legacyFonts: [],
        fonts: [],
        error: 'not a PDF body (soft 404)',
      };
    }
    const ev = pdfFontEvidence(bytes);
    return {
      ...base,
      status: res.status,
      isPdf: true,
      fontCount: ev.fontCount,
      toUnicodeCount: ev.toUnicodeCount,
      noToUnicode: ev.noToUnicode,
      legacyFonts: ev.legacyFonts,
      fonts: ev.fonts.slice(0, 8),
      error: null,
    };
  } catch (e) {
    return {
      ...base,
      status: null,
      isPdf: false,
      fontCount: 0,
      toUnicodeCount: 0,
      noToUnicode: false,
      legacyFonts: [],
      fonts: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

try {
  const candidates: Candidate[] = [];
  for (const code of COURTS)
    candidates.push(...(await drawFor(code, Math.ceil(LIMIT / COURTS.length))));

  const results: Result[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = next++;
        if (i >= candidates.length) return;
        results.push(await probe(candidates[i]!));
        if (results.length % 25 === 0) console.log(`probed ${results.length}/${candidates.length}`);
      }
    }),
  );

  /* Only font-READABLE PDFs can carry a verdict. A file whose fonts sit inside a
   * compressed object stream reports fontCount 0, and counting that as "no
   * ToUnicode" would turn a limit of the byte scan into a finding about the
   * corpus. */
  const summarise = (rows: Result[]) => {
    const readable = rows.filter((r) => r.isPdf && r.fontCount > 0);
    return {
      drawn: rows.length,
      fetchedPdf: rows.filter((r) => r.isPdf).length,
      softOrFailed: rows.filter((r) => !r.isPdf).length,
      fontReadable: readable.length,
      noToUnicode: readable.filter((r) => r.noToUnicode).length,
      noToUnicodeShare: readable.length
        ? Number((readable.filter((r) => r.noToUnicode).length / readable.length).toFixed(4))
        : null,
      withLegacyFontName: readable.filter((r) => r.legacyFonts.length > 0).length,
      medianEnglishRate: (() => {
        const v = rows.map((r) => r.englishRate).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)]! : null;
      })(),
    };
  };

  const byGroup = {
    suspect: summarise(results.filter((r) => r.group === 'suspect')),
    control: summarise(results.filter((r) => r.group === 'control')),
  };
  const byCourt = Object.fromEntries(
    COURTS.map((c) => [
      c,
      {
        suspect: summarise(results.filter((r) => r.code === c && r.group === 'suspect')),
        control: summarise(results.filter((r) => r.code === c && r.group === 'control')),
      },
    ]),
  );

  /* The font NAMES on the suspect side, which is the actionable half: a family
   * that recurs is a family a re-extraction or an OCR pass can be aimed at. */
  const fontTally = new Map<string, number>();
  for (const r of results.filter((x) => x.group === 'suspect')) {
    for (const f of new Set(r.fonts)) fontTally.set(f, (fontTally.get(f) ?? 0) + 1);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    question:
      'is the unreadable Tier-A text a PDF that cannot be extracted, or an extractor that failed on a good PDF?',
    courts: COURTS,
    englishRateFloor: ENGLISH_RATE_FLOOR,
    byGroup,
    byCourt,
    suspectFontNames: Object.fromEntries(
      [...fontTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
    ),
    rows: results.map(({ probe: _probe, ...rest }) => rest),
    caveats: [
      'noToUnicode is only meaningful on a font-READABLE file. pdfFontEvidence is a byte scan and cannot see fonts inside a compressed /ObjStm, which it reports as fontCount 0 rather than guessing — those rows are excluded from the share, not counted as negatives.',
      'The control group is drawn from the SAME court and the same uniform draw as the suspects. A noToUnicode share quoted without its control is not evidence: the base rate for a registry is unknown until it is measured.',
      'A response is a PDF only if it begins %PDF-. The bucket serves soft 404s as HTTP 200 with Content-Type application/pdf, and those are counted as fetch failures, never as unreadable PDFs.',
      'This probe reads fonts. It does not attempt a re-extraction, and it cannot say whether a different extractor would do better on the files that DO carry a ToUnicode map.',
    ],
  };

  console.log(
    [
      '',
      'group     drawn  pdf  fontReadable  noToUnicode  share   legacyFontName  medianEnglish',
      ...(['suspect', 'control'] as const).map((g) => {
        const s = byGroup[g];
        return `${g.padEnd(9)} ${String(s.drawn).padStart(5)} ${String(s.fetchedPdf).padStart(4)} ${String(s.fontReadable).padStart(13)} ${String(s.noToUnicode).padStart(12)} ${String(s.noToUnicodeShare === null ? '—' : (s.noToUnicodeShare * 100).toFixed(1) + '%').padStart(7)} ${String(s.withLegacyFontName).padStart(15)} ${String(s.medianEnglishRate).padStart(14)}`;
      }),
      '',
      'most common /BaseFont names on the suspect side:',
      ...[...fontTally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([f, n]) => `  ${String(n).padStart(4)}  ${f}`),
    ].join('\n'),
  );

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwritten ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
