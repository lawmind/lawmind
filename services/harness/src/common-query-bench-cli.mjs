#!/usr/bin/env node
/**
 * NEW1 — COMMON INDIAN LEGAL-QUERY BENCHMARK. R7 §9 NEW1-P0.
 *
 * Output: docs/ai/new1-tier-a/COMMON_QUERY_BENCHMARK.json
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS BENCHMARK CANNOT BE SCORED LIKE THE OTHERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every other NEW1 benchmark asks "did the ONE right authority come back". That
 * question is meaningless here. There is no single correct judgment for
 * *anticipatory bail* — there are tens of thousands, and an advocate typing those
 * two words wants a usable set, not a specific case they have not named.
 *
 * So this measures two different things and never mixes them:
 *
 *   COVERAGE   did the system return anything at all, or did it refuse?
 *   ANCHORED   of what came back, how much is actually ABOUT the concept?
 *   RELEVANCE
 *
 * Coverage exists because of a measured product failure. LCC's latency envelope
 * (bus 1173) found:
 *
 *     "bail"                                   -> 0 results, sparse_unbounded
 *     "anticipatory bail"                      -> 0 results, sparse_unbounded
 *     "anticipatory bail in economic offences"  -> 5 results, not degraded
 *
 * `bail` is 0.2577 of the sampled corpus, under the 0.5 SPARSE_MAX_DOCUMENT_
 * FREQUENCY cap, so the cap is not the refuser — the ANDed match-set estimate is.
 * The bound is doing its job and the PRODUCT outcome is that one of the most
 * common searches in Indian criminal practice renders an empty screen. A zero
 * from a refusal and a zero from a ranking miss are completely different
 * findings, and this benchmark separates them by construction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RELEVANCE ANCHORS ARE READ FROM THE DATABASE, NEVER FROM MEMORY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CLAUDE.md` §6: never invent a section number. `DOMAIN_TRUTH.md`: if a legal
 * fact is not held, it does not exist. Hand-labelling 500 results is also not
 * available, and a model's opinion of relevance is exactly the "commentary about
 * law" this project refuses to depend on.
 *
 * So each concept declares SEARCH TERMS for `statutes.short_title` and
 * `statute_sections.heading` — plain English, no numbers — and the benchmark
 * RESOLVES those to real section numbers and real headings by querying
 * `statute_sections`. Every anchor in the artifact therefore carries the statute,
 * the section number and the heading it came from, and a reader can check any of
 * them against the row. A concept whose statute is not held is emitted as
 * `NOT_ANCHORABLE` rather than guessed at.
 *
 * A result counts as ON-CONCEPT when the retrieved text contains at least one
 * `requiredAny` term. That is mechanical, auditable and deliberately crude: it
 * measures topicality, NOT legal correctness, and the artifact says so in a field
 * so no later reader can quote it as an accuracy number.
 *
 * USAGE
 *   node services/harness/src/common-query-bench-cli.mjs          # build + freeze
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url);
const OUT = new URL('docs/ai/new1-tier-a/COMMON_QUERY_BENCHMARK.json', ROOT);
const SEED = process.env.CQ_SEED ?? 'lawmind-new1-common-query-2026-08-25';

const url =
  process.env.DATABASE_URL ??
  readFileSync(new URL('.env', ROOT), 'utf8')
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .trim();

/**
 * THE CONCEPTS.
 *
 * The first ten are named in R7 §9 verbatim. The last two are added because they
 * are high-frequency in the held corpus and they probe a different shape: one is
 * a bare single word (the hardest case for the sparse guard) and one crosses the
 * IPC/BNS transition, which no frontier model knows and which DOMAIN_TRUTH.md
 * calls our largest factual edge and largest hallucination risk at once.
 *
 * `queries` deliberately spans lengths. LCC measured that the SAME concept
 * returns 0 results at two terms and 5 at four, so a benchmark that poses only
 * well-formed sentences would report this whole problem as solved.
 */
const CONCEPTS = [
  {
    id: 'CQ-01-bail',
    concept: 'bail',
    queries: ['bail', 'bail application', 'grant of bail in a criminal case', 'considerations for granting regular bail to an accused in custody'],
    statuteTerms: ['Nagarik Suraksha'],
    headingTerms: ['bail'],
    requiredAny: ['bail'],
  },
  {
    id: 'CQ-02-anticipatory-bail',
    concept: 'anticipatory bail',
    queries: ['anticipatory bail', 'anticipatory bail rejected', 'anticipatory bail in economic offences', 'when may a court grant anticipatory bail to a person apprehending arrest'],
    statuteTerms: ['Nagarik Suraksha'],
    headingTerms: ['anticipating arrest', 'apprehending arrest'],
    requiredAny: ['anticipatory bail'],
  },
  {
    id: 'CQ-03-quashing-fir',
    concept: 'quashing of FIR',
    queries: ['quashing FIR', 'quash the FIR', 'petition to quash a first information report', 'inherent power of the High Court to quash criminal proceedings on a settlement'],
    statuteTerms: ['Nagarik Suraksha'],
    headingTerms: ['inherent power'],
    requiredAny: ['quash', 'first information report', 'f.i.r'],
  },
  {
    id: 'CQ-04-injunction',
    concept: 'temporary injunction',
    queries: ['injunction', 'temporary injunction', 'grant of temporary injunction', 'principles governing the grant of a temporary injunction pending suit'],
    statuteTerms: ['Civil Procedure', 'Specific Relief'],
    headingTerms: ['injunction'],
    requiredAny: ['injunction'],
  },
  {
    id: 'CQ-05-limitation',
    concept: 'limitation and condonation of delay',
    queries: ['limitation', 'condonation of delay', 'appeal barred by limitation', 'sufficient cause for condoning delay in filing an appeal'],
    statuteTerms: ['Limitation Act'],
    headingTerms: ['sufficient cause', 'limitation'],
    requiredAny: ['limitation', 'condonation of delay', 'condone'],
  },
  {
    id: 'CQ-06-specific-performance',
    concept: 'specific performance of a contract',
    queries: ['specific performance', 'suit for specific performance', 'readiness and willingness specific performance', 'when will a court decree specific performance of an agreement to sell immovable property'],
    statuteTerms: ['Specific Relief'],
    headingTerms: ['specific performance'],
    requiredAny: ['specific performance'],
  },
  {
    id: 'CQ-07-arbitration-interim',
    concept: 'interim relief in arbitration',
    queries: ['section 9 arbitration', 'interim relief arbitration', 'interim measures by court arbitration', 'interim protection of assets pending an arbitral award'],
    statuteTerms: ['Arbitration and Conciliation'],
    headingTerms: ['interim measures'],
    requiredAny: ['arbitral', 'arbitration'],
  },
  {
    id: 'CQ-08-cheque-dishonour',
    concept: 'dishonour of cheque',
    queries: ['cheque bounce', 'section 138 NI Act', 'dishonour of cheque complaint', 'complaint for dishonour of a cheque for insufficiency of funds'],
    statuteTerms: ['Negotiable Instruments'],
    headingTerms: ['dishonour of cheque', 'presumption in favour of holder'],
    requiredAny: ['cheque'],
  },
  {
    id: 'CQ-09-service-termination',
    concept: 'termination of service',
    queries: ['termination of service', 'illegal termination', 'wrongful dismissal from service', 'termination of a workman without holding a departmental enquiry'],
    statuteTerms: ['Industrial Disputes'],
    headingTerms: ['discharge', 'dismissal', 'retrenchment'],
    requiredAny: ['termination', 'dismissal', 'retrench'],
  },
  {
    id: 'CQ-10-writ-maintainability',
    concept: 'maintainability of a writ petition',
    queries: ['writ maintainability', 'writ petition not maintainable', 'alternative remedy writ petition', 'whether a writ petition is maintainable when an efficacious alternative remedy exists'],
    statuteTerms: ['Constitution of India'],
    headingTerms: ['power of High Courts to issue certain writs', 'remedies for enforcement'],
    requiredAny: ['writ', 'maintainab'],
  },
  {
    id: 'CQ-11-murder-transition',
    concept: 'murder under the old and new criminal codes',
    queries: ['murder', 'section 302 IPC', 'punishment for murder BNS', 'conviction for murder where the offence was committed before 1 July 2024'],
    statuteTerms: ['Nyaya Sanhita'],
    headingTerms: ['punishment for murder'],
    requiredAny: ['murder'],
  },
  {
    id: 'CQ-12-maintenance',
    concept: 'maintenance of wife and children',
    queries: ['maintenance', 'interim maintenance wife', 'maintenance to wife and minor children', 'quantum of interim maintenance payable to a wife unable to maintain herself'],
    statuteTerms: ['Nagarik Suraksha'],
    headingTerms: ['maintenance of wives'],
    requiredAny: ['maintenance'],
  },
];

/**
 * WRONG-DOMAIN ADVERSARIAL PAIRS.
 *
 * R7 names `wrong-domain adversarial` as a family that may never be hidden behind
 * an aggregate, and NEW3's bus 1076 supplies the real instance: a commercial
 * breach-of-contract query returned an IPC 394 robbery judgment, and nothing in
 * the product said the answer was from another area of law.
 *
 * The correct behaviour here is NOT a good ranking. It is `abstained` or
 * `coverage_unknown`. A confident on-topic-looking answer drawn from the wrong
 * branch of law is worse than an empty screen, because the advocate cannot see
 * that it is wrong from the result list.
 *
 * Scored as: does anything come back whose text carries the FORBIDDEN domain's
 * vocabulary and none of the query's own? That is a false-confident wrong-domain
 * hit, and it is counted separately from every other miss.
 */
const WRONG_DOMAIN = [
  {
    id: 'WD-01-commercial-vs-robbery',
    query: 'breach of a commercial supply agreement and recovery of the outstanding invoice amount',
    domain: 'commercial contract',
    expectedAny: ['contract', 'agreement', 'supply', 'invoice', 'recovery'],
    forbiddenAny: ['robbery', 'dacoity', 'culpable homicide', 'rape', 'murder'],
    provenance: 'NEW3 bus 1076 — the IPC 394 robbery judgment returned for a commercial-breach query',
  },
  {
    id: 'WD-02-tax-vs-bail',
    query: 'input tax credit denied on the ground that the supplier did not deposit the tax',
    domain: 'indirect tax',
    expectedAny: ['tax credit', 'goods and services', 'gst', 'assessee', 'input tax'],
    forbiddenAny: ['bail', 'anticipatory bail', 'custody', 'chargesheet'],
    provenance: 'NEW1 — probes whether the sparse guard falls back to the largest population in the corpus',
  },
  {
    id: 'WD-03-matrimonial-vs-company',
    query: 'restitution of conjugal rights and the wife declining to return to the matrimonial home',
    domain: 'matrimonial',
    expectedAny: ['conjugal', 'matrimonial', 'husband', 'wife', 'marriage'],
    forbiddenAny: ['winding up', 'oppression and mismanagement', 'debenture', 'insolvency'],
    provenance: 'NEW1 — matrimonial vocabulary overlaps civil-suit vocabulary heavily',
  },
  {
    id: 'WD-04-land-acquisition-vs-criminal-trespass',
    query: 'compensation for land acquired for a national highway and the market value on the date of notification',
    domain: 'land acquisition',
    expectedAny: ['acquisition', 'compensation', 'market value', 'notification', 'award'],
    forbiddenAny: ['criminal trespass', 'house-breaking', 'mischief', 'cognizable offence'],
    provenance: 'NEW1 — "land" and "possession" appear in both branches',
  },
];

const sql = postgres(url, { max: 1, idle_timeout: 20, connection: { statement_timeout: 120_000 } });

try {
  const concepts = [];
  for (const c of CONCEPTS) {
    /**
     * Section numbers come from the ROW. `statuteTerms` and `headingTerms` are
     * plain English on purpose — the moment a number is typed into this file it
     * is a number from memory, and CLAUDE.md forbids exactly that.
     */
    const anchors = await sql`
      SELECT s.short_title, ss.section_number, ss.heading
      FROM statute_sections ss
      JOIN statutes s ON s.id = ss.statute_id
      WHERE (${c.statuteTerms}::text[] && ARRAY[]::text[]) IS NOT TRUE
        AND EXISTS (SELECT 1 FROM unnest(${c.statuteTerms}::text[]) t WHERE s.short_title ILIKE '%' || t || '%')
        AND EXISTS (SELECT 1 FROM unnest(${c.headingTerms}::text[]) t WHERE ss.heading ILIKE '%' || t || '%')
      ORDER BY s.short_title, ss.section_number
      LIMIT 25`;

    /**
     * Corpus frequency of the concept's own words, so a later reader can tell a
     * refusal driven by DOCUMENT FREQUENCY from one driven by ABSENCE.
     *
     * BOUNDED, and it has to be. The first version of this was
     * `count(*) ... WHERE full_text ILIKE '%bail%'` and it was killed by its own
     * 120s statement timeout — an unbounded ILIKE over 18.7M full texts is a
     * full-corpus scan, which is the thing R7 §5 forbids and which would have
     * been contending with the passage build on the same disk.
     *
     * TABLESAMPLE gives a rate with a stated denominator instead of a total with
     * no number at all. It is an ESTIMATE and the field name says so.
     */
    const [hit] = await sql`
      WITH s AS (SELECT full_text FROM judgments TABLESAMPLE SYSTEM (0.05))
      SELECT count(*)::text AS sampled,
             count(*) FILTER (WHERE full_text ILIKE ${'%' + c.requiredAny[0] + '%'})::text AS hits
      FROM s`;

    concepts.push({
      id: c.id,
      concept: c.concept,
      queries: c.queries.map((q) => ({
        query: q,
        terms: q.split(/\s+/).length,
        querySha256: createHash('sha256').update(q).digest('hex'),
      })),
      statuteAnchors: anchors.map((a) => ({
        statute: a.short_title,
        section: a.section_number,
        heading: a.heading,
      })),
      anchorState: anchors.length > 0 ? 'ANCHORED_FROM_DB' : 'NOT_ANCHORABLE',
      requiredAny: c.requiredAny,
      primaryTermDocumentFrequency: {
        sampled: Number(hit.sampled),
        hits: Number(hit.hits),
        ratePct: Number(((100 * Number(hit.hits)) / Math.max(1, Number(hit.sampled))).toFixed(3)),
        method: 'TABLESAMPLE SYSTEM (0.05) over judgments, ILIKE on full_text. An ESTIMATE with a stated denominator, never a corpus total.',
      },
      relevanceRule:
        'A result is ON-CONCEPT when its retrieved text contains at least one requiredAny term, case-insensitively. This measures TOPICALITY, never legal correctness, and no accuracy claim may be quoted from it.',
    });
    console.log(
      `${c.id.padEnd(26)} anchors ${String(anchors.length).padStart(2)}  df("${c.requiredAny[0]}") ${((100 * Number(hit.hits)) / Math.max(1, Number(hit.sampled))).toFixed(2)}% of ${Number(hit.sampled).toLocaleString()} sampled`,
    );
  }

  const wrongDomain = WRONG_DOMAIN.map((w) => ({
    ...w,
    querySha256: createHash('sha256').update(w.query).digest('hex'),
    correctOutcome:
      'abstained | coverage_unknown. A confident, on-topic-LOOKING answer drawn from the forbidden domain is worse than an empty screen, because the advocate cannot see it is wrong from the result list.',
  }));

  const body = {
    kind: 'new1_common_query_benchmark',
    version: 1,
    builtAt: new Date().toISOString(),
    seed: SEED,
    purpose:
      'Bounded, representative benchmark for the high-frequency Indian legal concepts an advocate actually types. Measures COVERAGE (did the backend refuse) separately from ANCHORED RELEVANCE (was what came back about the concept), because LCC bus 1173 measured a 0-result response for "anticipatory bail" that is a refusal, not a ranking miss.',
    boundedArmsOnly:
      'Arms compared are: (1) the current sparse guard, (2) passage ANN over new1_tranche_passages, (3) a bounded phrase/proximity lexical path, (4) at most one fusion if the first three prove complementary. NO full-corpus unbounded rank, and no new external search engine.',
    concepts,
    wrongDomain,
    limits: [
      'Topicality is not legal correctness. A judgment mentioning "bail" is on-concept by this rule even if it is useless to the advocate.',
      'requiredAny terms are English. A Hindi or Devanagari judgment about the same concept scores as off-concept, so per-concept relevance is a FLOOR, not an estimate.',
      'primaryTermDocumentFrequency is a 0.05% TABLESAMPLE and counts a passing mention the same as a holding. It is an estimate with a denominator, not a corpus count.',
      'No arm result is recorded in this file. This artifact is the FROZEN QUESTION SET; answers live in COMMON_QUERY_SEARCH_CONTRACT_V1.',
    ],
  };

  const { builtAt: _b, ...invariant } = body;
  const contentSha256 = createHash('sha256').update(JSON.stringify(invariant)).digest('hex');
  writeFileSync(OUT, JSON.stringify({ ...body, contentSha256 }, null, 2) + '\n');

  const anchored = concepts.filter((c) => c.anchorState === 'ANCHORED_FROM_DB').length;
  console.log('');
  console.log('COMMON QUERY BENCHMARK FROZEN');
  console.log(`  file           ${OUT.pathname}`);
  console.log(`  contentSha256  ${contentSha256}`);
  console.log(`  concepts       ${concepts.length} (${anchored} anchored from DB, ${concepts.length - anchored} NOT_ANCHORABLE)`);
  console.log(`  queries        ${concepts.reduce((a, c) => a + c.queries.length, 0)}`);
  console.log(`  wrong-domain   ${wrongDomain.length}`);
} finally {
  await sql.end({ timeout: 10 });
}
