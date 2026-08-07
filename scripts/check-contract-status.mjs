#!/usr/bin/env node
/**
 * Assert that `docs/API_CONTRACTS.md` §Implementation status tells the truth
 * about what is mounted in `services/api/src/app.ts`.
 *
 * **Why this exists.** The contract is four times the size of the implementation
 * and for days nothing distinguished the two. RCC read the file as a description
 * of the server, called `POST /citations/copies`, and got a 404 — the endpoint was
 * specced and never built. A status column fixes that once; a status column
 * nobody checks is wrong again within a week, which is the same failure with a
 * longer fuse.
 *
 * So the column is enforced. Adding a route without moving its row to BUILT
 * fails this check, and so does marking a row BUILT that no route serves.
 *
 * Path parameter NAMES are normalised away: the caller supplies a value, never a
 * name, so `GET /citations/:citationCheckId` and `GET /citations/:id` are the
 * same endpoint on the wire.
 */
import { readFileSync } from 'node:fs';

const CONTRACTS = 'docs/API_CONTRACTS.md';
const APP = 'services/api/src/app.ts';
const BEGIN = '<!-- BEGIN:status -->';
const END = '<!-- END:status -->';

const wire = (method, path) =>
  `${method} ${path.replace(/:[A-Za-z0-9_]+/g, ':p').replace(/\/+$/, '')}`;

const contracts = readFileSync(CONTRACTS, 'utf8');
const app = readFileSync(APP, 'utf8');

const begin = contracts.indexOf(BEGIN);
const end = contracts.indexOf(END);
if (begin === -1 || end === -1) {
  console.error(`${CONTRACTS}: missing ${BEGIN} / ${END} markers around the status table.`);
  process.exit(1);
}
const table = contracts.slice(begin, end);
const body = contracts.slice(0, begin) + contracts.slice(end);

/** Declared: every row of the status table. */
const declared = new Map();
for (const m of table.matchAll(/^\|\s*`(GET|POST|PATCH|PUT|DELETE)\s+(\/\S*)`\s*\|\s*(\w+)\s*\|/gm)) {
  const [, method, path, status] = m;
  if (status !== 'BUILT' && status !== 'SPECCED') {
    console.error(`${CONTRACTS}: ${method} ${path} has status "${status}" — expected BUILT or SPECCED.`);
    process.exit(1);
  }
  declared.set(wire(method, path), { label: `${method} ${path}`, status });
}

/** Specified: every endpoint written in the contract body, outside the table. */
const specified = new Map();
for (const line of body.split('\n')) {
  const m = line.match(/^\s*(GET|POST|PATCH|PUT|DELETE)\s+(\/\S*)/);
  if (m) specified.set(wire(m[1], m[2]), `${m[1]} ${m[2]}`);
}

/** Mounted: every route `createApp` actually serves. */
const mounted = new Map();
for (const m of app.matchAll(/app\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
  mounted.set(wire(m[1].toUpperCase(), m[2]), `${m[1].toUpperCase()} ${m[2]}`);
}

const problems = [];

for (const [k, label] of specified) {
  if (!declared.has(k)) problems.push(`specified in ${CONTRACTS} but absent from the status table: ${label}`);
}
for (const [k, label] of mounted) {
  if (!declared.has(k)) problems.push(`mounted in ${APP} but absent from the status table: ${label}`);
}
for (const [k, row] of declared) {
  const isMounted = mounted.has(k);
  if (row.status === 'BUILT' && !isMounted) {
    problems.push(`marked BUILT but no route is mounted: ${row.label}`);
  }
  if (row.status === 'SPECCED' && isMounted) {
    problems.push(`marked SPECCED but a route IS mounted — move it to BUILT: ${row.label}`);
  }
  if (!specified.has(k) && !isMounted) {
    problems.push(`in the status table but neither specified nor mounted: ${row.label}`);
  }
}

if (problems.length > 0) {
  console.error(`${CONTRACTS} §Implementation status disagrees with ${APP}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nUpdate the status table in the same commit as the route.`);
  process.exit(1);
}

const builtCount = [...declared.values()].filter((r) => r.status === 'BUILT').length;
console.log(
  `contract status ok · ${declared.size} endpoints · ${builtCount} built · ${declared.size - builtCount} specced`,
);
