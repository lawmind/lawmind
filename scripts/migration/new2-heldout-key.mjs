#!/usr/bin/env node
/**
 * NEW2 — THE HELD-OUT VALIDATION SET, AND ITS ANSWER KEY.
 *
 * ---------------------------------------------------------------------------
 * WHY THE KEY IS WRITTEN BEFORE THE MODEL RUNS, AND BY A DIFFERENT LANE
 * ---------------------------------------------------------------------------
 *
 * LCC will run DeepSeek candidate classification over the uncertain manifest.
 * NEW2 evaluates the output. That only means anything if the ground truth
 * existed BEFORE the output did — a key written afterwards is a key written
 * while looking at the answers, however carefully one tries not to.
 *
 * So this file records adjudications made on 20 August 2026 by reading each
 * document's own operative text, before any model was asked. The verdicts are
 * committed with their reasons. If a later evaluation disagrees with one, the
 * disagreement is the finding and the key is amended in the open, never quietly.
 *
 * ---------------------------------------------------------------------------
 * ADJUDICATED FROM THE TAIL, NEVER FROM THE HEAD
 * ---------------------------------------------------------------------------
 *
 * A cause title reads identically on a merits judgment and on an adjournment.
 * The operative paragraph is at the END. Adjudicating from the head is how 38 of
 * 45 evaluable `decided_brief` rows came to be read as merits decisions when
 * they were withdrawals and condonation applications.
 *
 * ---------------------------------------------------------------------------
 * IDs ARE RESOLVED FROM PREFIXES, THROUGH THE INDEX
 * ---------------------------------------------------------------------------
 *
 * The adjudications were recorded against 8-character id prefixes. `id::text
 * LIKE 'abc%'` cannot use `judgments_pkey`, so each prefix is expanded into a
 * uuid RANGE — `>= prefix-0000-...` and `<= prefix-ffff-...` — which is one
 * index descent. A prefix that resolves to more than one row is reported and
 * DROPPED rather than guessed at: an answer key with an ambiguous identity is
 * worse than one row shorter.
 *
 *   node --env-file=.env scripts/migration/new2-heldout-key.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { sslFor } from './new2-ssl.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'ops', 'migration');

/**
 * The five verdicts, as the standing direction names them.
 *
 * `UNCERTAIN` is a real verdict and not a failure to reach one. A tail that is a
 * service list or an annexure index genuinely does not say what the document is,
 * and recording a guess there would pollute the very number the key exists to
 * measure.
 */
const VERDICTS = [
  'HIGH_CONFIDENCE_SUBSTANTIVE',
  'NON_SUBSTANTIVE_PROCEDURAL',
  'UNCERTAIN',
  'TEXT_UNSAFE',
  'IDENTITY_UNSAFE',
];

/** [id prefix, verdict, the operative words the verdict was taken from]. */
const KEY = [
  [
    '192e943a',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'holds Art. 226 not maintainable against private persons where a private-law remedy exists',
  ],
  [
    'd41f6efb',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'enquiry order set aside, liberty to appoint a fresh enquiry officer',
  ],
  ['ce01f557', 'UNCERTAIN', 'tail is a service list; nothing operative visible'],
  [
    '5f3fd1ec',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    '62,713 chars, RULE ABSOLUTE/ALLOWED at final hearing; tail continues interim relief',
  ],
  [
    '9bbf4977',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'directs MPSC recommendation and consequential appointment within fixed periods',
  ],
  ['2d63cc49', 'NON_SUBSTANTIVE_PROCEDURAL', 'anticipatory bail granted under s. 438(2) CrPC'],
  [
    'e2dd8280',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'detention order set aside, detenu ordered set at liberty, rule made absolute',
  ],
  [
    'd4f6d113',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'writ disposed with liberty to challenge a decision yet to be made',
  ],
  [
    '49938ade',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'disposed with a direction to decide a representation by speaking order',
  ],
  ['e6fe8d0d', 'UNCERTAIN', 'tail is only the dasti direction and the digital-signature block'],
  [
    '8881b69d',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'office objections to be removed; matters relisted; notes disposed',
  ],
  [
    'cd5a9e85',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'bail conditions varied, fresh bonds, reporting schedule',
  ],
  [
    'a04da923',
    'UNCERTAIN',
    'tail is a service list on a Crl.OP; bail phrasing present but nothing operative',
  ],
  ['d5899fc8', 'NON_SUBSTANTIVE_PROCEDURAL', 'disposed as having been rendered infructuous'],
  [
    '704eced8',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'disposed with an observation and liberty to seek modification',
  ],
  [
    '26573ee8',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'named applicants ordered released on bail — the phrase the deployed pattern misses',
  ],
  [
    '63235d04',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'anticipatory bail refused, petitioners directed to surrender and seek regular bail',
  ],
  [
    '7651ff90',
    'UNCERTAIN',
    'partly allowed on bail-bond attestation; reasoned but not a lis on merits',
  ],
  ['d527a9cd', 'UNCERTAIN', 'application allowed; tail carries only the signature block'],
  ['9261df55', 'HIGH_CONFIDENCE_SUBSTANTIVE', 'FIR quashed as against the petitioners'],
  [
    'dea47b0a',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'undertaking to be filed in two weeks; miscellaneous petitions disposed',
  ],
  [
    '8aeefb50',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'tax reference answered on s. 35B(1)(b)(i)-(ii), in favour of the Revenue',
  ],
  ['18921c7c', 'UNCERTAIN', 'tail is a garbled registry block; body reads as English'],
  [
    '6205f26a',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'appeal fails; impugned order held free of illegality',
  ],
  ['8a59b95d', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail granted subject to s. 438(2) conditions'],
  [
    '99b22f0a',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'authorities to decide the representation; court expresses no opinion on merits',
  ],
  [
    '07838d53',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'MACT appeal dismissed after assessing income, dependency and multiplier',
  ],
  [
    '84ece61f',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'application dismissed with liberty to pursue the remedy elsewhere',
  ],
  ['fa7d7828', 'UNCERTAIN', '28,834 chars; tail is a list of writ petition numbers'],
  [
    'fef7b815',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'arbitrator appointed under s. 11 with fees under the Fourth Schedule',
  ],
  ['c1ae0f85', 'NON_SUBSTANTIVE_PROCEDURAL', 'writ petition dismissed as withdrawn'],
  [
    '0758c9ff',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'petition disposed with a compliance window and consequential action',
  ],
  [
    '9586f0b8',
    'UNCERTAIN',
    'writ appeal disposed with directions; the directions are not in the tail',
  ],
  [
    '41b4718a',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'settled in mediation; mediation report made part of the order',
  ],
  [
    '3505746a',
    'NON_SUBSTANTIVE_PROCEDURAL',
    '119,374 chars and disposed in the same terms as another case — a follow-on order with no independent ratio',
  ],
  [
    '8940ba99',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'disposed following a batch matter, rights reserved per that batch',
  ],
  [
    '91d3afbf',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'interest at 7% on leave encashment ordered for a defined period',
  ],
  [
    '8766b399',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'anticipatory bail refused on the seriousness of the allegations',
  ],
  [
    '6e9f881b',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'appeal against a Commissioner disbursement order dismissed on merits',
  ],
  ['3575fcb8', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail granted under s. 438(2)'],
  [
    '9787fdac',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'conviction and appellate order set aside; accused acquitted under ss. 279, 304A IPC',
  ],
  [
    '2f78a15d',
    'UNCERTAIN',
    'tail is registry garbage at englishRate 20.7 — degraded, not unreadable',
  ],
  [
    'ac442d50',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'partition award quashed so far as one plot is concerned; writ allowed in part',
  ],
  [
    '88e316c7',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'anticipatory bail rejected with a direction to surrender and apply below',
  ],
  [
    'c8ba1d27',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'appeal disposed in terms of a named earlier decision',
  ],

  /* SECOND SITTING, 21 August 2026, drawn from the same uniform sample under
   * eligibility contract v2. Adjudicated the same way and under the same rule:
   * from the operative text at the END, and UNCERTAIN wherever the tail is a
   * service list, an exhibit index or a garbled registry block rather than a
   * decision. Added because LCC's first run against this key had only 33
   * scorable rows, and 33 gives an interval of plus or minus eleven points on
   * the only accuracy figure anyone has for the population the tier is made of.
   * Rows the density screen calls unreadable are excluded from the draw: a key
   * row nobody can read is a key row nobody can score. */
  [
    '01c99302',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'liberty to institute execution proceedings; disposed without deciding anything',
  ],
  [
    '6b7704fc',
    'UNCERTAIN',
    'payment terms and a clearance-certificate direction; relief granted but no reasoning visible',
  ],
  [
    'c2235fe2',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'confiscation conditions settled on the merits, rule made absolute',
  ],
  [
    'bead476b',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'bail application disposed with s. 438-type conditions',
  ],
  ['4e1b9ab6', 'UNCERTAIN', 'CMA dismissed without costs; the tail is a garbled registry block'],
  ['c81da334', 'UNCERTAIN', 'Crl.OP; the tail is a service list'],
  [
    'd97884aa',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'interim protection discharged on a condition; petition disposed with a direction',
  ],
  [
    '6f7cb146',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'revisional application disposed, interim order vacated',
  ],
  ['4ee48ecd', 'NON_SUBSTANTIVE_PROCEDURAL', 'surrender and bail bond under s. 438(2) CrPC'],
  [
    '97c3616a',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'arbitral and tribunal orders held free of infirmity; writ dismissed on merits',
  ],
  [
    'd98a62d5',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'decided in terms of an earlier judgment on the respondents concession',
  ],
  [
    'd9c94b5c',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'protection order expressly conferring no legitimacy on the marriage or the age',
  ],
  [
    '0877724d',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'bail allowed on surety, class already labelled bail_order',
  ],
  [
    'e0e887cc',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'prosecution quashed under s. 482 CrPC, petitioners released from prosecution',
  ],
  [
    '4be6247f',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'quashing refused on a reasoned finding that a cognizable offence is prima facie made out',
  ],
  [
    '2e11bea1',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'bail conditions including Aadhaar and cooperation at trial',
  ],
  [
    '5cab60f0',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'impugned order quashed for breach of natural justice; 59,026 characters',
  ],
  ['3e3be355', 'UNCERTAIN', 'Crl.OP(MD); the tail is a service list'],
  [
    '54a6664e',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'trial court view held legal and valid; appeal dismissed',
  ],
  [
    '5c5847a8',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'restoration of an appeal allowed after condoning delay',
  ],
  [
    '2ded327e',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'stay petition to be considered; recovery kept in abeyance meanwhile',
  ],
  [
    '6549c90b',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'direction to allocate funds so an earlier order can be complied with',
  ],
  [
    'c6d5f66c',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'bias plea rejected for want of pleading and of a party-respondent; petition dismissed',
  ],
  ['078e6c12', 'UNCERTAIN', 'the tail is an exhibit list'],
  [
    '958659b1',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'representation to be decided within four weeks per a named earlier judgment',
  ],
  ['ccd218f8', 'UNCERTAIN', 'the tail is a respondent list'],
  [
    'bbee4fcd',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'anticipatory bail on a maintenance-payment condition',
  ],
  [
    'a7e329db',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'listing direction to verify compliance with an earlier order',
  ],
  [
    '8daf644a',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'Wakf Board to consider and decide after hearing; no finding made',
  ],
  ['dfd826f2', 'UNCERTAIN', 'H.C.P.; the tail is a service list'],
  [
    '03a611cc',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'bail allowed on surety, class already labelled bail_order',
  ],
  ['90aedc46', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail conditions on inducement and fair trial'],
  [
    '7aeac6b9',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'civil appeals dismissed and the consequent contempt petitions with them; 128,120 characters',
  ],
  [
    'b8e17669',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'maintenance quantum examined on capacity to earn; no case to interfere',
  ],
  ['aef49be3', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail conditions including surrender of passport'],
  ['913d53b2', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail application allowed on personal bond'],
  [
    '71212cea',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'writ dismissed as misconceived after examining the Magistrate order',
  ],
  ['a1308748', 'NON_SUBSTANTIVE_PROCEDURAL', 'bail granted with bailor and attendance conditions'],
  [
    'c7678a2d',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'civil revision allowed and remanded on s. 35 Stamp Act and the s. 49 Registration Act proviso',
  ],
  [
    'fd133a93',
    'HIGH_CONFIDENCE_SUBSTANTIVE',
    'court below held to have committed no error; petition devoid of merits dismissed',
  ],
  ['6b90b546', 'UNCERTAIN', 'the tail is a garbled registry and service block'],
  [
    'e865af63',
    'NON_SUBSTANTIVE_PROCEDURAL',
    'notice issued and the matter adjourned to a named date',
  ],
];

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL not set — run with node --env-file=.env');
  process.exit(2);
}
const sql = postgres(url, {
  ssl: sslFor(url),
  max: 1,
  idle_timeout: 5,
  connect_timeout: 30,
  prepare: false,
});

try {
  for (const [, v] of KEY) {
    if (!VERDICTS.includes(v)) {
      console.error(`unknown verdict ${v}`);
      process.exit(2);
    }
  }

  const resolved = [];
  const ambiguous = [];
  const missing = [];

  for (const [prefix, verdict, reason] of KEY) {
    const lo = `${prefix}-0000-0000-0000-000000000000`;
    const hi = `${prefix}-ffff-ffff-ffff-ffffffffffff`;
    const rows = await sql`
      SELECT id, court, judgment_date::text AS judgment_date, case_number,
             hc_document_class, hc_class_method, disposal_nature,
             length(substr(full_text, 1, 200001)) AS text_len
        FROM judgments
       WHERE id >= ${lo}::uuid AND id <= ${hi}::uuid
       LIMIT 3`;
    if (rows.length === 0) {
      missing.push(prefix);
      continue;
    }
    if (rows.length > 1) {
      ambiguous.push({ prefix, matches: rows.length });
      continue;
    }
    const r = rows[0];
    resolved.push({
      documentId: r.id,
      court: r.court,
      judgmentYear: r.judgment_date ? Number(r.judgment_date.slice(0, 4)) : null,
      caseNumber: r.case_number,
      textLength: r.text_len,
      /* Recorded as EVIDENCE the adjudicator did not use, so a later evaluation
       * can check whether the key and the stored label agree — and where they do
       * not, which one the document supports. */
      storedClassAtKeyTime: r.hc_document_class,
      storedMethodAtKeyTime: r.hc_class_method,
      dispositionAtKeyTime: r.disposal_nature,
      verdict,
      reason,
    });
  }

  const tally = {};
  for (const r of resolved) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;

  const key = {
    generatedAt: new Date().toISOString(),
    lane: 'NEW2',
    purpose: 'independent ground truth for evaluating LCC DeepSeek candidate classification',
    adjudicatedOn: '2026-08-20',
    adjudicatedFrom: 'the operative text at the END of each document, never the cause title',
    population: 'uniform draws from judgments that the deployed eligibility view ADMITS to Tier A',
    verdicts: VERDICTS,
    counts: tally,
    resolved: resolved.length,
    ambiguousPrefixes: ambiguous,
    missingPrefixes: missing,
    rows: resolved,
    caveats: [
      'Written before any model output was seen. If an evaluation disagrees with a row here, amend this file in the open with the reason; do not adjust it silently to match a model.',
      'UNCERTAIN is a verdict, not an abstention. A tail that is a service list or an annexure index does not say what the document is, and a guess there would corrupt the accuracy figure the key exists to produce.',
      'n is small by construction. It bounds the accuracy of a model on THIS population with a wide interval; it is not a corpus rate and must never be quoted as one.',
      'storedClassAtKeyTime is recorded as evidence, not as truth. The classifier is running as this key is written, so the same row may carry a different label an hour later — which is itself worth seeing.',
    ],
  };

  /* The question set and the answer key are written as SEPARATE files on
   * purpose. Handing one file to whoever runs the model makes the answers
   * available to the run, and the whole value of a held-out set is that they
   * were not. */
  const questions = {
    generatedAt: key.generatedAt,
    lane: 'NEW2',
    purpose:
      'held-out validation ids for LCC DeepSeek candidate classification — NO VERDICTS IN THIS FILE',
    verdicts: VERDICTS,
    rows: resolved.map((r) => ({
      documentId: r.documentId,
      court: r.court,
      judgmentYear: r.judgmentYear,
      caseNumber: r.caseNumber,
      textLength: r.textLength,
    })),
  };

  writeFileSync(join(OUT_DIR, 'new2-heldout-key.json'), `${JSON.stringify(key, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, 'new2-heldout-questions.json'),
    `${JSON.stringify(questions, null, 2)}\n`,
  );

  console.log(
    [
      `adjudicated        ${KEY.length}`,
      `resolved           ${resolved.length}`,
      `ambiguous prefixes ${ambiguous.length}${ambiguous.length ? ` — ${ambiguous.map((a) => a.prefix).join(', ')}` : ''}`,
      `missing prefixes   ${missing.length}${missing.length ? ` — ${missing.join(', ')}` : ''}`,
      '',
      ...Object.entries(tally).map(
        ([k, v]) =>
          `  ${k.padEnd(30)} ${String(v).padStart(3)}  ${((100 * v) / resolved.length).toFixed(1)}%`,
      ),
      '',
      `key       ${join(OUT_DIR, 'new2-heldout-key.json')}`,
      `questions ${join(OUT_DIR, 'new2-heldout-questions.json')}`,
    ].join('\n'),
  );
} finally {
  await sql.end({ timeout: 5 });
}
