/**
 * NEW2 — AN INDEPENDENT AUDIT OF WHAT THE SEMANTIC CORE ACTUALLY ADMITS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A SECOND COPY OF THE CLASS-PRECISION SAMPLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc-class-precision-cli.ts` draws rows stratified BY CLASS, which measures how
 * often a label is right. That is a useful question and it is not this one.
 *
 * The selector that decides what gets a vector is the deployed view
 * `judgment_embedding_eligibility`, and the class label is only one of its five
 * conjuncts. Three of the others admit rows on the ABSENCE of evidence:
 *
 *   axis_c_role   `hc_document_class IS NULL OR class NOT IN (...)`
 *                 — 90% of the corpus is unclassified and every one of those
 *                   rows passes on a NULL.
 *   axis_b_text   `script_quality IS NULL OR script_quality IN (clean, ...)`
 *                 — 99.7% of the corpus is unscreened and passes on a NULL.
 *   value_band    length >= 2,000 characters, which is the only thing in the
 *                 predicate that even gestures at substance.
 *
 * A class-stratified sample cannot see any of that, because it only draws rows
 * that HAVE a class. So this tool samples the ADMITTED POPULATION — rows the
 * view lets through — and asks what is in it. Sampling the output of a selector
 * is the only way to measure a selector that admits by default.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW A ROW IS DRAWN, AND WHY IT IS UNIFORM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SELECT ... WHERE id > $random ORDER BY id LIMIT 1`, with `$random` a fresh
 * uuid v4. `judgments.id` is itself uuid v4, i.e. uniform over the key space, so
 * the nearest row above a uniform point is a uniform draw over rows, and it
 * costs one index descent.
 *
 * `TABLESAMPLE SYSTEM` was rejected for the reason LCC and NEW1 both hit
 * already: it samples PAGES, and this corpus is written court-by-court and
 * year-by-year, so rows sharing a page share a court and a year. A page sample
 * skews along exactly the axes an audit of court/year coverage is stratified on.
 * `TABLESAMPLE BERNOULLI` is uniform but scans the whole 140 GB relation.
 *
 * The draw is over the WHOLE table and the eligibility predicate is then applied
 * in JavaScript from the row's own columns. That is deliberate: it yields the
 * admitted and the rejected populations from one pass, so "what does the
 * selector let in" and "what does it throw away" are measured on the same
 * sample rather than on two.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS CLASSIFIED MECHANICALLY AND WHAT IS LEFT FOR A HUMAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two of the five audit verdicts are decidable from evidence on the row and are
 * written here:
 *
 *   TEXT UNSAFE       the legacy-font marker screen fires, or the text carries
 *                     no assessable tokens at all. Zero false positives in 939
 *                     PDF-labelled clean documents across nine courts, so a
 *                     positive is evidence rather than a guess.
 *   IDENTITY UNSAFE   the identity axis is weak, or the row is a member of an
 *                     exact-content group whose members span more than one
 *                     court — a common order inside one registry is normal, the
 *                     same bytes under two registries is not.
 *
 * The other three — HIGH-CONFIDENCE SUBSTANTIVE, NON-SUBSTANTIVE / PROCEDURAL,
 * UNCERTAIN — are about what the document IS, and nothing on the row answers
 * that. Guessing them from `hc_document_class` would make the audit a test of
 * the label being audited. So this tool emits the evidence an adjudicator needs
 * and writes `PENDING_ADJUDICATION`, and the verdict is filled in by whoever
 * reads it.
 *
 * `textTail` is emitted as well as `textHead` and it is the more important of
 * the two. A cause title reads identically on a merits judgment and on an
 * adjournment; the operative paragraph is at the END. Adjudicating from the head
 * is how 38 of 45 evaluable `decided_brief` rows came to be labelled as merits
 * decisions when they were withdrawals and condonation applications.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/semantic-core-audit-cli.ts [--draws 4000] [--adjudicate 150] \
 *     [--json ../../docs/ops/migration/new2-semantic-core-audit.json]
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openDb } from './db-host.ts';
import { MINED_MARKERS, SUSPECT_MARKER_RATE, textSignature } from './legacy-font.ts';
import {
  BAIL_PHRASE,
  BAIL_PHRASE_AS_DEPLOYED,
  ENGLISH_RATE_FLOOR,
  englishRate,
} from './quality-state.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const DRAWS = Number(argOf('draws', '4000'));
/** How many admitted rows carry full adjudication evidence into the artifact. */
const ADJUDICATE = Number(argOf('adjudicate', '150'));
const JSON_OUT = argOf('json');
const CONCURRENCY = Number(argOf('concurrency', '4'));

/** Head and tail sizes. The tail is longer because the operative part is there. */
const HEAD = 700;
const TAIL = 1400;

/**
 * How much text the SCRIPT screen sees, as opposed to the adjudication excerpt.
 *
 * The first version of this tool ran the legacy-font marker screen over the
 * head and tail only — 2,100 characters — and reported 0.16% legacy font among
 * admitted rows. That number is not wrong so much as unusable: the screen fires
 * on a marker RATE per thousand characters, and a probe assembled from two ends
 * of a document is not a sample of it. 20,000 characters covers a `standard` or
 * `full` band document entirely and the great majority of a `substantial` one,
 * at a bounded detoast.
 */
const PROBE = 20000;

type Row = {
  id: string;
  court: string | null;
  judgment_date: string | null;
  case_number: string | null;
  case_title: string | null;
  content_hash: string | null;
  text_quality: string | null;
  script_quality: string | null;
  hc_document_class: string | null;
  hc_class_method: string | null;
  disposal_nature: string | null;
  source_url: string | null;
  text_extraction_method: string | null;
  native_text: boolean | null;
  text_len: number | null;
  probe: string | null;
  head?: string | null;
  tail: string | null;
  member_count: number | null;
  courts_in_group: number | null;
};

/**
 * The deployed predicate, re-evaluated in JavaScript from the row's own columns.
 *
 * This is a SECOND expression of a definition that lives in the database, which
 * is normally the thing to avoid. It is justified here and only here: the point
 * of the audit is to attribute admission to a specific conjunct, and SQL can
 * only report the conjunction. Every clause below is a transcription of
 * `pg_get_viewdef('judgment_embedding_eligibility')` as read on 20 Aug 2026, and
 * the run records the deployed hash beside its results so a drift between the
 * two is visible rather than assumed away.
 */
function axes(r: Row): {
  identity: boolean;
  text: boolean;
  role: boolean;
  bail: boolean;
  band: string;
  admitted: boolean;
  tier: string;
} {
  const len = r.text_len ?? 0;
  const tq = r.text_quality === null ? 0 : Number(r.text_quality);
  const identity =
    r.content_hash !== null &&
    r.case_number !== null &&
    r.judgment_date !== null &&
    r.court !== null &&
    (r.case_title ?? '').length > 3;
  const text =
    len > 0 &&
    tq >= 0.85 &&
    (r.script_quality === null || ['clean', 'mixed_script_ok'].includes(r.script_quality));
  /* `decided_brief` was added to this list by migration 0063 and the exclusion is
   * a NO-OP: `BRIEF_MAX_CHARS` is 1,500, below the 2,000-character band floor, so
   * no row of that class ever reached the band anyway. Transcribed faithfully
   * rather than simplified, because this function's only job is to be the view. */
  const role =
    r.hc_document_class === null ||
    !['procedural_disposal', 'reference_stub', 'decided_brief'].includes(r.hc_document_class);
  const bail = r.hc_document_class === 'bail_order';
  const band =
    len >= 8000
      ? 'substantial'
      : len >= 4000
        ? 'full'
        : len >= 2000
          ? 'standard'
          : len >= 1000
            ? 'brief'
            : 'stub';

  /**
   * `semantic_tier`, migration 0066.
   *
   * ADMITTED IS NO LONGER `NOT is_bail_order`. LCC took the decision on NEW1's
   * 250-authority gold — judges cite bail orders in 12 of 250, 4.8% — and bail
   * orders are now reachable under their own tier rather than broken out and
   * dropped. So `admitted` here means "the view gives this row a tier that is not
   * NOT_ELIGIBLE", which is what decides whether a vector gets spent.
   *
   * Note the tier ladder does NOT consult `axis_c_role`: a row is NOT_ELIGIBLE on
   * identity, text and length alone, and the role classes then choose between the
   * three reachable tiers. `axis_c_role` is still computed and still reported,
   * because a consumer selecting on it directly gets a different population from
   * one selecting on the tier, and an audit that reported only one of them would
   * hide that.
   */
  const eligible = identity && text && ['standard', 'full', 'substantial'].includes(band);
  const tier = !eligible
    ? 'NOT_ELIGIBLE'
    : bail
      ? 'BAIL_ORDER_REACHABLE'
      : ['decided_brief', 'procedural_disposal', 'reference_stub'].includes(
            r.hc_document_class ?? '',
          )
        ? 'UNRESOLVED_EXPERIMENTAL'
        : r.hc_document_class === 'decided' &&
            ['clean', 'mixed_script_ok'].includes(r.script_quality ?? '')
          ? 'VERIFIED_SEMANTIC_CORE'
          : 'BROAD_SEARCHABLE';

  return { identity, text, role, bail, band, admitted: eligible, tier };
}

/**
 * Why a row was admitted, expressed as what the selector did NOT know about it.
 *
 * This is the field the audit exists to produce. "Admitted" is not one event: a
 * row admitted because a rule read its disposal string and called it a merits
 * judgment is a different bet from a row admitted because nothing has ever read
 * it, and the second is the overwhelming majority.
 */
function admissionReason(r: Row): string {
  const roleKnown = r.hc_document_class !== null;
  const scriptKnown = r.script_quality !== null;
  if (!roleKnown && !scriptKnown) return 'no_role_evidence_and_no_script_evidence';
  if (!roleKnown) return 'no_role_evidence';
  if (!scriptKnown) return `role_${r.hc_document_class}_no_script_evidence`;
  return `role_${r.hc_document_class}_script_${r.script_quality}`;
}

/**
 * ENGLISH FUNCTION-WORD DENSITY — the detector the marker screen needs beside it.
 *
 * Adjudicating 40 admitted rows by hand turned up two documents that are total
 * substitution-cipher garbage — `0 :270 49 86082627-43 49 @26: 92-1-3>` — and
 * the mined-marker screen fired on NEITHER. That is not a surprising failure
 * once stated: the marker list was mined from Kruti-Dev-family Hindi, so it
 * recognises the ASCII a SPECIFIC legacy encoding produces. A different broken
 * encoding produces different ASCII and the list has nothing to say about it.
 *
 * So this measures the complementary thing, and it is deliberately not a marker
 * list at all: **how much English is in text that claims to be English.** Every
 * judgment in this corpus, in any language, is delivered in a bilingual registry
 * whose orders, cause titles and operative lines carry a dense skeleton of
 * English function words. Text with no Devanagari AND almost no English function
 * words is not a document in either language.
 *
 * The list is function words and courtroom furniture only — no legal reasoning
 * terms — so a short procedural order scores as highly as a long judgment and
 * the screen does not accidentally become a substance detector.
 *
 * NO THRESHOLD IS APPLIED HERE. The rate is reported and its distribution is
 * emitted, because choosing a cut before seeing the distribution is how the
 * marker screen came to have a floor nobody could defend afterwards.
 */
/* The screens themselves live in `quality-state.ts` so the audit's percentages
 * and the quality export's rows cannot drift apart. Both bail patterns are
 * measured: the one the classifier runs today, and the whitespace-tolerant one
 * that replaces it. */

/** Citation-shaped strings, as a presence signal only. Not a resolver. */
const CITATION_PATTERNS: readonly RegExp[] = [
  /\b\d{4}\s*\(\s*\d+\s*\)\s*[A-Z]{2,6}\b/g,
  /\b\(\s*\d{4}\s*\)\s*\d+\s*[A-Z]{2,6}\b/g,
  /\bAIR\s+\d{4}\s+[A-Z]{2,4}\b/g,
  /\b\d{4}\s+SCC\s+/g,
  /\b\d{4}\s*:\s*[A-Z]{2,10}\s*:\s*\d+/g,
];
function citationHits(text: string): number {
  let n = 0;
  for (const re of CITATION_PATTERNS) n += (text.match(re) ?? []).length;
  return n;
}

const sql = await openDb(url, CONCURRENCY + 1, 5 * 60_000);

/* The deployed definition, recorded so the JS transcription above can be shown
 * to be a transcription of THIS and not of something that has since changed. */
const [view] = (await sql`
  SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def
`) as unknown as { def: string }[];
const { createHash } = await import('node:crypto');
const deployedHash = createHash('sha256')
  .update(view?.def ?? '')
  .digest('hex')
  .slice(0, 16);

/**
 * One draw. `substr` rather than `full_text` on purpose: the head and tail are
 * all the adjudicator needs, and `length(substr(full_text, 1, 200001))` bounds
 * the detoast at 200 KB rather than pulling a 27,949-character mean — and, for
 * the `substantial` band, occasionally a great deal more — across every draw.
 * The length is exact below 200,000 characters and saturates above it, which is
 * far above every band boundary the predicate uses.
 */
async function draw(): Promise<Row | null> {
  const rows = (await sql`
    SELECT j.id,
           j.court,
           j.judgment_date::text                       AS judgment_date,
           j.case_number,
           j.case_title,
           j.content_hash,
           j.text_quality::text                        AS text_quality,
           j.script_quality,
           j.hc_document_class,
           j.hc_class_method,
           j.disposal_nature,
           j.source_url,
           j.text_extraction_method,
           j.native_text,
           length(substr(j.full_text, 1, 200001))      AS text_len,
           substr(j.full_text, 1, ${PROBE})            AS probe,
           right(substr(j.full_text, 1, 200001), ${TAIL}) AS tail,
           r.member_count::int                         AS member_count,
           NULL::int                                   AS courts_in_group
      FROM judgments j
      LEFT JOIN embedding_content_representative r ON r.content_hash = j.content_hash
     WHERE j.id > ${randomUUID()}::uuid
     ORDER BY j.id
     LIMIT 1`) as unknown as Row[];
  return rows[0] ?? null;
}

type Audited = Row & {
  band: string;
  admitted: boolean;
  semanticTier: string;
  axisIdentity: boolean;
  axisText: boolean;
  axisRole: boolean;
  isBail: boolean;
  admissionReason: string;
  zeroDevanagari: boolean;
  asciiRatio: number;
  markerRate: number;
  markerHits: { marker: string; count: number }[];
  citationHits: number;
  englishRate: number;
  bailPhrase: boolean;
  bailPhraseAsDeployed: boolean;
  mechanicalVerdict: string;
};

const audited: Audited[] = [];
const started = Date.now();

/* Draws are independent, so they run a few at a time. Concurrency is deliberately
 * small: the GPU embedding feed and the DeepSeek persistence run own this box's
 * spare capacity, and an audit that has to be scheduled around is an audit that
 * does not get run. */
let issued = 0;
async function worker(): Promise<void> {
  for (;;) {
    if (issued >= DRAWS) return;
    issued++;
    const r = await draw();
    if (!r) continue;
    const a = axes(r);
    /* The screens see the leading PROBE characters PLUS the tail, so a document
     * longer than PROBE still contributes its ending. The adjudication excerpt is
     * cut from the same buffer rather than fetched again.
     *
     * This line read `r.head` for one session and `head` was no longer selected,
     * so every screen ran on the 1,400-character tail alone. Recorded rather than
     * quietly fixed: the first figures published from this tool were computed on
     * a probe an order of magnitude smaller than the one described above, and the
     * citation-presence number in particular moved a long way when it was fixed. */
    const probe = `${r.probe ?? ''}\n${r.tail ?? ''}`;
    r.head = (r.probe ?? '').slice(0, HEAD);
    const sig = textSignature(probe, MINED_MARKERS);

    /* TEXT UNSAFE and IDENTITY UNSAFE are the two verdicts evidence can settle.
     * Everything else is PENDING_ADJUDICATION rather than a guess dressed as a
     * verdict. Order matters: an unsafe TEXT makes the role question moot,
     * because whatever the document is, what we hold is not it. */
    const en = englishRate(probe);
    let verdict = 'PENDING_ADJUDICATION';
    if (sig.zeroDevanagari && sig.markerRate >= SUSPECT_MARKER_RATE)
      verdict = 'TEXT_UNSAFE_LEGACY_FONT';
    else if ((r.text_len ?? 0) > 0 && !/[A-Za-z]/.test(probe) && sig.zeroDevanagari)
      verdict = 'TEXT_UNSAFE_NO_SCRIPT';
    /* The cut was chosen AFTER the distribution was seen and after documents on
     * both sides of it were read. Below 12 English function words per thousand
     * characters, with no Devanagari, the sampled documents are substitution
     * garbage whose only real text is the digital-signature appliance's footer
     * ("I attest to the accuracy and integrity of this document"). Between 12
     * and 40 they are readable English with OCR spacing damage — degraded, not
     * unsafe — so the cut is not raised to catch them. */
    else if (sig.zeroDevanagari && en < ENGLISH_RATE_FLOOR) verdict = 'TEXT_UNSAFE_NO_ENGLISH';
    else if (!a.identity) verdict = 'IDENTITY_UNSAFE_AXIS_A';

    audited.push({
      ...r,
      band: a.band,
      admitted: a.admitted,
      semanticTier: a.tier,
      axisIdentity: a.identity,
      axisText: a.text,
      axisRole: a.role,
      isBail: a.bail,
      admissionReason: admissionReason(r),
      zeroDevanagari: sig.zeroDevanagari,
      asciiRatio: Number(sig.asciiRatio.toFixed(4)),
      markerRate: Number(sig.markerRate.toFixed(3)),
      markerHits: sig.markerHits.slice(0, 6),
      citationHits: citationHits(probe),
      englishRate: Number(en.toFixed(2)),
      bailPhrase: BAIL_PHRASE.test(probe),
      bailPhraseAsDeployed: BAIL_PHRASE_AS_DEPLOYED.test(probe),
      mechanicalVerdict: verdict,
    });

    if (audited.length % 250 === 0) {
      const adm = audited.filter((x) => x.admitted).length;
      console.log(
        `[${audited.length}/${DRAWS}] admitted ${adm} (${((100 * adm) / audited.length).toFixed(1)}%) · ` +
          `${(audited.length / Math.max(1, (Date.now() - started) / 1000)).toFixed(1)} draws/s`,
      );
    }
  }
}

try {
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  /* Cross-court membership for the sampled duplicate groups only. One indexed
   * probe per distinct hash with more than one member — bounded by the sample,
   * not by the 301,531 groups in the corpus. */
  const multi = [
    ...new Set(audited.filter((a) => (a.member_count ?? 1) > 1).map((a) => a.content_hash!)),
  ];
  for (const h of multi) {
    const [c] = (await sql`
      SELECT count(DISTINCT court)::int AS n FROM judgments WHERE content_hash = ${h}
    `) as unknown as { n: number }[];
    for (const a of audited) {
      if (a.content_hash === h) {
        a.courts_in_group = c?.n ?? null;
        if ((c?.n ?? 1) > 1 && a.mechanicalVerdict === 'PENDING_ADJUDICATION') {
          a.mechanicalVerdict = 'IDENTITY_UNSAFE_CROSS_COURT_DUPLICATE';
        }
      }
    }
  }

  const admitted = audited.filter((a) => a.admitted);
  const tally = <T extends string | number | boolean | null>(
    rows: Audited[],
    f: (a: Audited) => T,
  ) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = String(f(r));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };

  /* The adjudication queue is drawn from the ADMITTED rows only, and it is
   * ordered by nothing — taking the highest-risk rows first would make the
   * adjudicated share unrepresentative of what the selector admits. */
  const queue = admitted.slice(0, ADJUDICATE).map((a) => ({
    id: a.id,
    court: a.court,
    year: a.judgment_date?.slice(0, 4) ?? null,
    caseNumber: a.case_number,
    band: a.band,
    textLen: a.text_len,
    hcDocumentClass: a.hc_document_class,
    hcClassMethod: a.hc_class_method,
    disposalNature: a.disposal_nature,
    admissionReason: a.admissionReason,
    scriptQuality: a.script_quality,
    textQuality: a.text_quality,
    zeroDevanagari: a.zeroDevanagari,
    markerRate: a.markerRate,
    citationHits: a.citationHits,
    englishRate: a.englishRate,
    bailPhrase: a.bailPhrase,
    memberCount: a.member_count,
    mechanicalVerdict: a.mechanicalVerdict,
    sourceUrl: a.source_url,
    textHead: a.head,
    textTail: a.tail,
    /* Filled in by the adjudicator. Left explicitly null rather than absent so a
     * partially adjudicated file cannot be mistaken for a complete one. */
    auditVerdict: null,
    auditNote: null,
  }));

  const out = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    independentOf:
      'hc_document_class — the class is recorded as evidence, never used as the answer',
    deployedViewHash: deployedHash,
    draws: audited.length,
    admitted: admitted.length,
    admittedShare: Number((admitted.length / Math.max(1, audited.length)).toFixed(4)),
    breakdown: {
      /* The tier is what actually decides whether a vector is spent, so it leads.
       * `VERIFIED_SEMANTIC_CORE` reading zero is the honest state and not a bug:
       * it needs positive evidence on BOTH axes, and `script_quality` is written
       * for 58,615 rows of 18,698,968. LCC reached the same zero from the view
       * side; two routes to the same zero is the strongest evidence either lane
       * has that it is real. */
      semanticTier: tally(admitted, (a) => a.semanticTier),
      admissionReason: tally(admitted, (a) => a.admissionReason),
      band: tally(admitted, (a) => a.band),
      court: tally(admitted, (a) => a.court),
      yearBand: tally(admitted, (a) => {
        const y = Number(a.judgment_date?.slice(0, 4) ?? 0);
        return y === 0
          ? 'unknown'
          : y < 2010
            ? 'pre-2010'
            : y < 2016
              ? '2010-2015'
              : y < 2023
                ? '2016-2022'
                : '2023+';
      }),
      classAmongAdmitted: tally(admitted, (a) => a.hc_document_class ?? 'NULL'),
      classMethodAmongAdmitted: tally(admitted, (a) => a.hc_class_method ?? 'NULL'),
      extractionMethod: tally(admitted, (a) => a.text_extraction_method ?? 'NULL'),
      mechanicalVerdict: tally(admitted, (a) => a.mechanicalVerdict),
      citationPresence: tally(admitted, (a) =>
        a.citationHits === 0 ? 'none' : a.citationHits < 3 ? '1-2' : '3+',
      ),
      duplicateMembership: tally(admitted, (a) =>
        (a.member_count ?? 1) > 1 ? 'in_group' : 'singleton',
      ),
      /* The crosstabs the first run could not answer. Citation presence and the
       * script screen both depend on how much of a document the probe saw, so
       * both are reported PER BAND rather than pooled — a `standard` document is
       * read to its end and a `substantial` one is not, and a single pooled
       * percentage silently averages a measurement with a truncation. */
      citationByBand: Object.fromEntries(
        ['standard', 'full', 'substantial'].map((b) => {
          const rows = admitted.filter((a) => a.band === b);
          const none = rows.filter((a) => a.citationHits === 0).length;
          return [
            b,
            {
              rows: rows.length,
              none,
              noneShare: Number((none / Math.max(1, rows.length)).toFixed(4)),
            },
          ];
        }),
      ),
      scriptByBand: Object.fromEntries(
        ['standard', 'full', 'substantial'].map((b) => {
          const rows = admitted.filter((a) => a.band === b);
          const zeroDev = rows.filter((a) => a.zeroDevanagari).length;
          const legacy = rows.filter(
            (a) => a.mechanicalVerdict === 'TEXT_UNSAFE_LEGACY_FONT',
          ).length;
          return [
            b,
            {
              rows: rows.length,
              zeroDevanagari: zeroDev,
              devanagariPresent: rows.length - zeroDev,
              legacyFontSuspect: legacy,
              legacyShare: Number((legacy / Math.max(1, rows.length)).toFixed(4)),
            },
          ];
        }),
      ),
      /* Legacy-font rate by court, among admitted. The corpus-wide figure hides
       * this completely: the pilot's positives were 36 of 398 in Rajasthan and
       * 1 of 386 across eight control courts. */
      scriptByCourt: Object.fromEntries(
        [...new Set(admitted.map((a) => a.court ?? 'unknown'))]
          .map((c) => {
            const rows = admitted.filter((a) => (a.court ?? 'unknown') === c);
            const legacy = rows.filter(
              (a) => a.mechanicalVerdict === 'TEXT_UNSAFE_LEGACY_FONT',
            ).length;
            const dev = rows.filter((a) => !a.zeroDevanagari).length;
            return [
              c,
              { rows: rows.length, legacyFontSuspect: legacy, devanagariPresent: dev },
            ] as const;
          })
          .sort((a, b) => b[1].legacyFontSuspect - a[1].legacyFontSuspect || b[1].rows - a[1].rows),
      ),
      /* The distribution, not a verdict. A cut is chosen from this AFTERWARDS,
       * against documents read by eye, and never before it is seen. */
      englishRateHistogram: (() => {
        const edges = [0, 1, 2, 4, 8, 12, 16, 20, 25, 30, 40];
        const h: Record<string, number> = {};
        for (let i = 0; i < edges.length; i++) {
          const lo = edges[i]!;
          const hi = edges[i + 1];
          const k = hi === undefined ? `${lo}+` : `${lo}-${hi}`;
          h[k] = admitted.filter(
            (a) => a.englishRate >= lo && (hi === undefined || a.englishRate < hi),
          ).length;
        }
        return h;
      })(),
      /* Bail orders inside the admitted population, by whether anything had ever
       * classified them. The view's bail break-out can only act on a label. */
      bailPhraseAmongAdmitted: {
        total: admitted.filter((a) => a.bailPhrase).length,
        withNoClassLabel: admitted.filter((a) => a.bailPhrase && a.hc_document_class === null)
          .length,
        share: Number(
          (admitted.filter((a) => a.bailPhrase).length / Math.max(1, admitted.length)).toFixed(4),
        ),
        /* What the classifier's own pattern would have found. The gap is bail
         * orders the production rule cannot see — most of them phrases the PDF
         * wrapped across a line, plus two phrasings the deployed list has no
         * entry for at all. */
        asDeployedPattern: admitted.filter((a) => a.bailPhraseAsDeployed).length,
        missedByDeployedPattern: admitted.filter((a) => a.bailPhrase && !a.bailPhraseAsDeployed)
          .length,
      },
      /* Where the unreadable population actually lives. A corpus-wide rate for
       * this would be as misleading as a corpus-wide embedding-coverage rate
       * was: 18 of 26 courts sat at exactly zero behind one healthy percentage. */
      lowEnglishByCourt: Object.fromEntries(
        [...new Set(admitted.map((a) => a.court ?? 'unknown'))]
          .map((c) => {
            const rows = admitted.filter((a) => (a.court ?? 'unknown') === c);
            const low = rows.filter((a) => a.englishRate < ENGLISH_RATE_FLOOR).length;
            return [
              c,
              {
                rows: rows.length,
                lowEnglish: low,
                share: Number((low / Math.max(1, rows.length)).toFixed(4)),
              },
            ] as const;
          })
          .sort((a, b) => b[1].share - a[1].share || b[1].rows - a[1].rows),
      ),
      lowEnglishByExtractionMethod: Object.fromEntries(
        [...new Set(admitted.map((a) => a.text_extraction_method ?? 'NULL'))].map((m) => {
          const rows = admitted.filter((a) => (a.text_extraction_method ?? 'NULL') === m);
          const low = rows.filter((a) => a.englishRate < ENGLISH_RATE_FLOOR).length;
          return [
            m,
            {
              rows: rows.length,
              lowEnglish: low,
              share: Number((low / Math.max(1, rows.length)).toFixed(4)),
            },
          ];
        }),
      ),
      /* text_quality is the column the eligibility view actually gates on. If it
       * scores the unreadable population as clean, that is the mechanism — not
       * an observation about a neighbouring metric. */
      textQualityOnLowEnglish: (() => {
        const low = admitted.filter((a) => a.englishRate < ENGLISH_RATE_FLOOR);
        const scored = low
          .filter((a) => a.text_quality !== null)
          .map((a) => Number(a.text_quality));
        scored.sort((x, y) => x - y);
        return {
          rows: low.length,
          withScore: scored.length,
          min: scored[0] ?? null,
          median: scored.length ? scored[Math.floor(scored.length / 2)] : null,
          atOrAbove085: scored.filter((v) => v >= 0.85).length,
        };
      })(),
      admissionReasonByBand: Object.fromEntries(
        ['standard', 'full', 'substantial'].map((b) => [
          b,
          tally(
            admitted.filter((a) => a.band === b),
            (a) => a.admissionReason,
          ),
        ]),
      ),
    },
    /* Every draw, by tier, including the rejected ones — the view assigns a tier
     * to every row in the corpus and reporting only the admitted half would hide
     * the denominator. */
    semanticTierAllDraws: tally(audited, (a) => a.semanticTier),
    rejected: {
      total: audited.length - admitted.length,
      /**
       * Attributed in the tier ladder's own order, which is NOT the order the
       * conjuncts are written in.
       *
       * Under migration 0066 a row is `NOT_ELIGIBLE` on identity, text and length
       * alone. `axis_c_role` and `is_bail_order` choose between the three
       * REACHABLE tiers and can no longer reject anything, so neither may appear
       * here as a rejection reason. An earlier ordering tested role before band
       * and reported 1,034 rejections as `role` that were really short documents
       * — a rejection attributed to a conjunct that had stopped rejecting.
       */
      byFailingAxis: tally(
        audited.filter((a) => !a.admitted),
        (a) => (!a.axisIdentity ? 'identity' : !a.axisText ? 'text' : `band_${a.band}`),
      ),
      /* The role classes among rejected rows, reported separately because they
       * are a PROPERTY of the rejected population and not a cause of it. */
      roleAmongRejected: tally(
        audited.filter((a) => !a.admitted),
        (a) => a.hc_document_class ?? 'NULL',
      ),
    },
    adjudicationQueue: queue,
    caveats: [
      'Draws are uniform over judgments.id, which is uuid v4. If ids ever stop being uniformly distributed — a sequential or time-ordered id scheme, a bulk load with a fixed prefix — this sampler silently stops being uniform and nothing here would notice.',
      'The eligibility predicate is transcribed into JavaScript so that admission can be attributed to a single conjunct, which SQL cannot report. The deployed view hash is recorded above; if it differs from the hash in the report that quoted this run, the transcription must be re-read before any number here is trusted. It has already drifted once: migration 0066 made bail orders reachable and added semantic_tier, and this file was updated to follow rather than the other way round.',
      'admitted now means "the view gives this row a tier other than NOT_ELIGIBLE". Before migration 0066 it meant that AND not a bail order, so an admitted count from this tool taken before 21 Aug 2026 is over a smaller population by roughly the bail share.',
      'text_len saturates at 200,000 characters. Every band boundary the predicate uses is far below that, so bands are exact; a mean length computed from this field is not.',
      'The marker screen fires on the head and tail only, not on the whole document. Its recall on a truncated probe is lower than the 76.2% measured on full text, so the legacy-font rate reported here is a FLOOR.',
      'HIGH-CONFIDENCE SUBSTANTIVE, NON-SUBSTANTIVE and UNCERTAIN are deliberately NOT assigned mechanically. A row reading PENDING_ADJUDICATION has not been judged, and counting those as substantive would restate the selector as its own audit.',
    ],
  };

  console.log(
    [
      '',
      `draws                  ${out.draws.toLocaleString()}`,
      `admitted by the view   ${out.admitted.toLocaleString()} (${(out.admittedShare * 100).toFixed(1)}%)`,
      `deployed view hash     ${deployedHash}`,
      '',
      'semantic tier, among admitted:',
      ...Object.entries(out.breakdown.semanticTier).map(
        ([k, v]) =>
          `  ${k.padEnd(46)} ${String(v).padStart(6)}  ${((100 * v) / out.admitted).toFixed(1)}%`,
      ),
      '',
      'admission reason, among admitted:',
      ...Object.entries(out.breakdown.admissionReason).map(
        ([k, v]) =>
          `  ${k.padEnd(46)} ${String(v).padStart(6)}  ${((100 * v) / out.admitted).toFixed(1)}%`,
      ),
      '',
      'mechanical verdict, among admitted:',
      ...Object.entries(out.breakdown.mechanicalVerdict).map(
        ([k, v]) =>
          `  ${k.padEnd(46)} ${String(v).padStart(6)}  ${((100 * v) / out.admitted).toFixed(1)}%`,
      ),
      '',
      'rejected, by first failing axis:',
      ...Object.entries(out.rejected.byFailingAxis).map(
        ([k, v]) => `  ${k.padEnd(46)} ${String(v).padStart(6)}`,
      ),
    ].join('\n'),
  );

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\nwritten ${JSON_OUT}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
