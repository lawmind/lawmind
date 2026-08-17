#!/usr/bin/env node
/**
 * CX1 premium backend shadow lab.
 *
 * Offline synthetic harness only. It models the proposed observation -> matter
 * projection flow for premium matter intelligence without querying PostgreSQL,
 * touching canonical schema, calling a model, fetching eCourts, or emitting
 * legal advice.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-premium-backend-lab');
const OUT_JSON = path.join(OUT_DIR, 'premium-backend-lab.json');
const OUT_SUMMARY_CSV = path.join(OUT_DIR, 'scenario-summary.csv');
const OUT_READINESS_CSV = path.join(OUT_DIR, 'hearing-pack-readiness.csv');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_PREMIUM_DATA_BACKEND_LAB.md');

const TODAY = '2026-08-17';
const YESTERDAY_CUTOFF = '2026-08-16T00:00:00.000Z';

const matterFixtures = [
  {
    id: 'matter-alpha',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    title: 'Alpha Exports v. Beta Components',
    advocateKey: 'advocate-a',
  },
  {
    id: 'matter-gamma',
    court: 'Bombay High Court',
    cnr: 'MHHC020000022026',
    title: 'Gamma Finance v. Delta Works',
    advocateKey: 'advocate-a',
  },
  {
    id: 'matter-omega',
    court: 'Karnataka High Court',
    cnr: 'KAHC030000032025',
    title: 'Omega Textiles v. State Board',
    advocateKey: 'advocate-b',
  },
];

const observationFixtures = [
  {
    source: 'ecourts',
    sourceId: 'dlhc-alpha-filed',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    observedAt: '2026-08-14T06:10:00.000Z',
    eventDate: '2026-08-14',
    kind: 'registered',
    payload: { status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'dlhc-alpha-listed-20260818',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    observedAt: '2026-08-16T05:00:00.000Z',
    eventDate: '2026-08-18',
    kind: 'cause_list_seen',
    payload: { hearingDate: '2026-08-18', bench: 'Bench A', itemNumber: '23', status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'dlhc-alpha-listed-20260818',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    observedAt: '2026-08-16T05:03:00.000Z',
    eventDate: '2026-08-18',
    kind: 'cause_list_seen',
    payload: { hearingDate: '2026-08-18', bench: 'Bench A', itemNumber: '23', status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'dlhc-alpha-order-001',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    observedAt: '2026-08-17T04:45:00.000Z',
    eventDate: '2026-08-16',
    kind: 'order_uploaded',
    payload: {
      documentId: 'doc-order-alpha-001',
      documentClass: 'order',
      title: 'Interim order uploaded',
      orderDate: '2026-08-16',
      summary: 'Synthetic order summary for backend readiness testing.',
    },
  },
  {
    source: 'ecourts',
    sourceId: 'dlhc-alpha-bench-change',
    court: 'Delhi High Court',
    cnr: 'DLHC010000012026',
    observedAt: '2026-08-17T06:00:00.000Z',
    eventDate: '2026-08-18',
    kind: 'bench_assigned',
    payload: { hearingDate: '2026-08-18', bench: 'Bench B', itemNumber: '23', status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'mhhc-gamma-listed-20260818',
    court: 'Bombay High Court',
    cnr: 'MHHC020000022026',
    observedAt: '2026-08-17T02:20:00.000Z',
    eventDate: '2026-08-18',
    kind: 'cause_list_seen',
    payload: { hearingDate: '2026-08-18', bench: 'Court 4', itemNumber: '9', status: 'active' },
  },
  {
    source: 'manual',
    sourceId: 'mhhc-gamma-note-001',
    court: 'Bombay High Court',
    cnr: 'MHHC020000022026',
    observedAt: '2026-08-17T03:00:00.000Z',
    eventDate: '2026-08-17',
    kind: 'filing',
    payload: { filingType: 'reply', noteVisibility: 'private', status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'kahc-omega-disposed',
    court: 'Karnataka High Court',
    cnr: 'KAHC030000032025',
    observedAt: '2026-08-15T07:00:00.000Z',
    eventDate: '2026-08-15',
    kind: 'disposed',
    payload: { status: 'disposed', documentId: 'doc-judgment-omega-001', documentClass: 'judgment' },
  },
  {
    source: 'ecourts',
    sourceId: 'kahc-omega-late-old-listing',
    court: 'Karnataka High Court',
    cnr: 'KAHC030000032025',
    observedAt: '2026-08-17T08:00:00.000Z',
    eventDate: '2026-08-01',
    kind: 'cause_list_seen',
    payload: { hearingDate: '2026-08-01', bench: 'Court 2', itemNumber: '41', status: 'active' },
  },
  {
    source: 'ecourts',
    sourceId: 'unlinked-listed-001',
    court: 'Madras High Court',
    cnr: 'TNHC040000042026',
    observedAt: '2026-08-17T04:00:00.000Z',
    eventDate: '2026-08-20',
    kind: 'cause_list_seen',
    payload: { hearingDate: '2026-08-20', bench: 'Court 7', itemNumber: '12', status: 'active' },
  },
];

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function dayAfter(date) {
  const dt = new Date(`${date}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function keyForObservation(obs) {
  return [obs.source, obs.court, obs.cnr, obs.sourceId, obs.kind].join('|');
}

function isCitable(documentClass) {
  return documentClass === 'judgment';
}

function transitionFor(obs, beforeState, afterState) {
  if (obs.kind === 'cause_list_seen') {
    return beforeState.nextHearingDate && beforeState.nextHearingDate !== afterState.nextHearingDate
      ? 'next_date_changed'
      : 'listed';
  }
  if (obs.kind === 'bench_assigned') return 'bench_changed';
  return obs.kind;
}

function emptyState(matter) {
  return {
    matterId: matter.id,
    court: matter.court,
    cnr: matter.cnr,
    status: 'active',
    nextHearingDate: null,
    bench: null,
    itemNumber: null,
    lastOrderDocumentId: null,
    lastOrderDate: null,
    lastObservationAt: null,
  };
}

function applyObservation(state, obs) {
  const next = { ...state, lastObservationAt: obs.observedAt };
  if (obs.payload.status === 'disposed' || obs.kind === 'disposed') {
    next.status = 'disposed';
    next.nextHearingDate = null;
  } else if (state.status !== 'disposed' && obs.payload.status) {
    next.status = obs.payload.status;
  }

  if (state.status !== 'disposed' && obs.payload.hearingDate) next.nextHearingDate = obs.payload.hearingDate;
  if (state.status !== 'disposed' && obs.payload.bench) next.bench = obs.payload.bench;
  if (state.status !== 'disposed' && obs.payload.itemNumber) next.itemNumber = obs.payload.itemNumber;

  if (obs.kind === 'order_uploaded') {
    next.lastOrderDocumentId = obs.payload.documentId;
    next.lastOrderDate = obs.payload.orderDate || obs.eventDate;
  }

  return next;
}

function readinessFor(matter, state, timeline, legalDocuments) {
  const matterDocs = legalDocuments.filter((doc) => doc.matterId === matter.id);
  const hasLatestOrder = Boolean(state.lastOrderDocumentId);
  const hasHearing = Boolean(state.nextHearingDate);
  const hasPriorTimeline = timeline.filter((event) => event.matterId === matter.id).length >= 2;
  const hasCourtRecord = matterDocs.some((doc) => doc.documentClass === 'order' || doc.documentClass === 'judgment');
  const required = [
    { item: 'next hearing date', present: hasHearing },
    { item: 'latest court order or judgment', present: hasLatestOrder || state.status === 'disposed' },
    { item: 'prior matter timeline', present: hasPriorTimeline },
    { item: 'court-record document metadata', present: hasCourtRecord },
    { item: 'authority/citation packet', present: false },
  ];
  const present = required.filter((item) => item.present).length;
  return {
    matterId: matter.id,
    nextHearingDate: state.nextHearingDate,
    status: state.status,
    ready: present === required.length,
    readinessScore: present / required.length,
    missing: required.filter((item) => !item.present).map((item) => item.item),
  };
}

function buildProjection() {
  const mattersByKey = new Map(matterFixtures.map((matter) => [`${matter.court}|${matter.cnr}`, matter]));
  const stateByMatter = new Map(matterFixtures.map((matter) => [matter.id, emptyState(matter)]));
  const seen = new Set();
  const duplicates = [];
  const unlinked = [];
  const timeline = [];
  const legalDocuments = [];

  const sorted = [...observationFixtures].sort(
    (a, b) =>
      new Date(a.observedAt) - new Date(b.observedAt) ||
      new Date(a.eventDate) - new Date(b.eventDate) ||
      keyForObservation(a).localeCompare(keyForObservation(b)),
  );

  for (const obs of sorted) {
    const dedupeKey = keyForObservation(obs);
    if (seen.has(dedupeKey)) {
      duplicates.push({ sourceId: obs.sourceId, dedupeKey });
      continue;
    }
    seen.add(dedupeKey);

    const matter = mattersByKey.get(`${obs.court}|${obs.cnr}`);
    if (!matter) {
      unlinked.push({ sourceId: obs.sourceId, court: obs.court, cnr: obs.cnr, kind: obs.kind });
      continue;
    }

    const before = stateByMatter.get(matter.id);
    const after = applyObservation(before, obs);
    stateByMatter.set(matter.id, after);

    const transition = transitionFor(obs, before, after);
    timeline.push({
      id: `evt-${stableHash({ matterId: matter.id, sourceId: obs.sourceId, kind: obs.kind })}`,
      matterId: matter.id,
      eventDate: obs.eventDate,
      observedAt: obs.observedAt,
      source: obs.source,
      sourceId: obs.sourceId,
      kind: obs.kind,
      transition,
      stateBefore: before,
      stateAfter: after,
    });

    if (obs.payload.documentId) {
      legalDocuments.push({
        matterId: matter.id,
        documentId: obs.payload.documentId,
        documentClass: obs.payload.documentClass,
        title: obs.payload.title || obs.payload.documentClass,
        sourceObservationId: obs.sourceId,
        isCitable: isCitable(obs.payload.documentClass),
      });
    }
  }

  timeline.sort(
    (a, b) =>
      a.matterId.localeCompare(b.matterId) ||
      new Date(a.eventDate) - new Date(b.eventDate) ||
      new Date(a.observedAt) - new Date(b.observedAt) ||
      a.id.localeCompare(b.id),
  );

  const states = matterFixtures.map((matter) => stateByMatter.get(matter.id));
  const tomorrow = dayAfter(TODAY);
  const nextHearingTriggers = states
    .filter((state) => state.status !== 'disposed' && state.nextHearingDate === tomorrow)
    .map((state) => ({ matterId: state.matterId, nextHearingDate: state.nextHearingDate, bench: state.bench }));
  const changedSinceYesterday = timeline
    .filter((event) => new Date(event.observedAt) >= new Date(YESTERDAY_CUTOFF))
    .map((event) => ({
      matterId: event.matterId,
      observedAt: event.observedAt,
      transition: event.transition,
      kind: event.kind,
      eventDate: event.eventDate,
    }));
  const newOrders = timeline
    .filter((event) => event.kind === 'order_uploaded')
    .map((event) => ({
      matterId: event.matterId,
      sourceId: event.sourceId,
      observedAt: event.observedAt,
      documentId: event.stateAfter.lastOrderDocumentId,
    }));
  const conflicts = [];
  for (const left of states) {
    for (const right of states) {
      if (left.matterId >= right.matterId) continue;
      const leftMatter = matterFixtures.find((matter) => matter.id === left.matterId);
      const rightMatter = matterFixtures.find((matter) => matter.id === right.matterId);
      if (
        left.status !== 'disposed' &&
        right.status !== 'disposed' &&
        left.nextHearingDate &&
        left.nextHearingDate === right.nextHearingDate &&
        leftMatter.advocateKey === rightMatter.advocateKey
      ) {
        conflicts.push({
          matterIds: [left.matterId, right.matterId],
          advocateKey: leftMatter.advocateKey,
          hearingDate: left.nextHearingDate,
          reason: 'same advocate has two active matters listed on the same date',
        });
      }
    }
  }
  const hearingPackReadiness = matterFixtures.map((matter) =>
    readinessFor(matter, stateByMatter.get(matter.id), timeline, legalDocuments),
  );

  return {
    timeline,
    states,
    duplicates,
    unlinked,
    legalDocuments,
    nextHearingTriggers,
    changedSinceYesterday,
    newOrders,
    conflicts,
    hearingPackReadiness,
  };
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# CX1 Premium Data Backend Lab');
  lines.push('');
  lines.push(`Generated: **${result.generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('Synthetic offline Workstream K harness for premium matter-data backend behavior. It writes no production rows, makes no model calls, fetches no provider data, and does not propose a canonical migration.');
  lines.push('');
  lines.push('## Proposed Shadow Shape Tested');
  lines.push('');
  lines.push('- `case_observations`: append source observations keyed by source/court/CNR/source id, before adoption by any matter.');
  lines.push('- `matter_events`: projected advocate-facing timeline only after a matter is linked.');
  lines.push('- `legal_documents`: procedural documents are separated from citable judgments; `order` and `cause_list` classes are not citable.');
  lines.push('- `matters`: latest-state cache only, derived from observations/events rather than treated as the source of truth.');
  lines.push('');
  lines.push('## Synthetic Scenario Results');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|---|---:|');
  lines.push(`| Input observations | ${result.metrics.inputObservations} |`);
  lines.push(`| Unique linked observations | ${result.metrics.uniqueLinkedObservations} |`);
  lines.push(`| Duplicate observations collapsed | ${result.metrics.duplicatesCollapsed} |`);
  lines.push(`| Unlinked observations retained | ${result.metrics.unlinkedObservations} |`);
  lines.push(`| Timeline events | ${result.metrics.timelineEvents} |`);
  lines.push(`| Legal documents projected | ${result.metrics.legalDocuments} |`);
  lines.push(`| New orders detected | ${result.metrics.newOrdersDetected} |`);
  lines.push(`| Tomorrow hearing triggers | ${result.metrics.nextHearingTriggers} |`);
  lines.push(`| Same-advocate date conflicts | ${result.metrics.conflicts} |`);
  lines.push('');
  lines.push('## Latest Matter State');
  lines.push('');
  lines.push('| Matter | Status | Next hearing | Bench | Latest order |');
  lines.push('|---|---|---|---|---|');
  for (const state of result.projection.states) {
    lines.push(
      `| \`${state.matterId}\` | ${state.status} | ${state.nextHearingDate || ''} | ${state.bench || ''} | ${state.lastOrderDocumentId || ''} |`,
    );
  }
  lines.push('');
  lines.push('## Assertions');
  lines.push('');
  for (const check of result.assertions) lines.push(`- ${check.status}: ${check.name}`);
  lines.push('');
  lines.push('## Outputs');
  lines.push('');
  lines.push(`- JSON: \`${rel(OUT_JSON)}\``);
  lines.push(`- Scenario CSV: \`${rel(OUT_SUMMARY_CSV)}\``);
  lines.push(`- Readiness CSV: \`${rel(OUT_READINESS_CSV)}\``);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(result.boundary);
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const projection = buildProjection();
  const alpha = projection.states.find((state) => state.matterId === 'matter-alpha');
  const gamma = projection.states.find((state) => state.matterId === 'matter-gamma');
  const omega = projection.states.find((state) => state.matterId === 'matter-omega');

  const assertions = [
    ['duplicate observation collapsed', () => assert.equal(projection.duplicates.length, 1)],
    ['unlinked observation retained outside matter timeline', () => assert.equal(projection.unlinked.length, 1)],
    ['tomorrow hearing trigger exists for alpha', () => assert.equal(alpha.nextHearingDate, '2026-08-18')],
    ['bench change updates latest state', () => assert.equal(alpha.bench, 'Bench B')],
    ['new order detected without citable promotion', () => {
      assert.equal(projection.newOrders.length, 1);
      assert.equal(projection.legalDocuments.find((doc) => doc.documentId === 'doc-order-alpha-001').isCitable, false);
    }],
    ['judgment remains citable while procedural objects do not', () => {
      assert.equal(projection.legalDocuments.find((doc) => doc.documentId === 'doc-judgment-omega-001').isCitable, true);
    }],
    ['disposed state remains terminal despite late old listing', () => {
      assert.equal(omega.status, 'disposed');
      assert.equal(omega.nextHearingDate, null);
    }],
    ['same advocate same date conflict is detected', () => {
      assert.equal(gamma.nextHearingDate, '2026-08-18');
      assert.equal(projection.conflicts.length, 1);
    }],
  ].map(([name, fn]) => {
    fn();
    return { name, status: 'PASS' };
  });

  const result = {
    schema: 'cx1-premium-backend-lab-v1',
    generatedAt: new Date().toISOString(),
    fixedToday: TODAY,
    yesterdayCutoff: YESTERDAY_CUTOFF,
    status: 'complete_sample',
    boundary:
      'Synthetic CX1 shadow lab only: no production DB reads/writes, no canonical schema/API/UI edit, no provider fetch, no model call, no legal advice, and no citation confirmation.',
    inputs: {
      matterFixtures: matterFixtures.length,
      observationFixtures: observationFixtures.length,
      dataClass: 'synthetic only; no uploaded client document or real party data',
    },
    metrics: {
      inputObservations: observationFixtures.length,
      uniqueLinkedObservations: projection.timeline.length,
      duplicatesCollapsed: projection.duplicates.length,
      unlinkedObservations: projection.unlinked.length,
      timelineEvents: projection.timeline.length,
      legalDocuments: projection.legalDocuments.length,
      newOrdersDetected: projection.newOrders.length,
      nextHearingTriggers: projection.nextHearingTriggers.length,
      conflicts: projection.conflicts.length,
    },
    assertions,
    projection,
    openImplementationQuestions: [
      'Which owner lane owns the observation-to-matter matcher and confidence threshold?',
      'How long should unlinked observation rows be retained when no adopted matter exists?',
      'Should hearing-pack readiness become API data only, notification data, or both?',
      'What exact conflict dimensions are safe for MVP: same advocate/date only, or date/time/court/bench where available?',
    ],
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  writeCsv(OUT_SUMMARY_CSV, projection.timeline, [
    'matterId',
    'eventDate',
    'observedAt',
    'source',
    'sourceId',
    'kind',
    'transition',
  ]);
  writeCsv(OUT_READINESS_CSV, projection.hearingPackReadiness, [
    'matterId',
    'status',
    'nextHearingDate',
    'ready',
    'readinessScore',
    'missing',
  ]);
  fs.writeFileSync(OUT_MD, renderMarkdown(result));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
}

main();
