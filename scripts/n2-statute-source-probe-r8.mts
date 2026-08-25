/**
 * NEW2 — R8.1 §7.15 IPC / CrPC / IEA official source reconciliation, round 2.
 *
 * READ-ONLY against external sources. Writes nothing to `statutes` or
 * `statute_sections`. Downloads nothing; it records what an artifact IS, so a
 * later acquisition can be planned against evidence instead of hope.
 *
 * ## What R7 already established, and why this is not a repeat
 *
 * `STATUTE_ACQUISITION_PROBE_V1` probed India Code DSpace by EXACT TITLE and
 * concluded:
 *
 *   IPC            PARTIAL       a Chandigarh state item, ss. 1-120B only
 *   IEA (modern)   COMPLETE      171 of 183 sections parsed
 *   IEA (1872)     PROVEN_DAMAGED
 *   CrPC           NOT AVAILABLE every exact-title item has zero bitstreams
 *
 * §7.15 says to reconcile the repo's historical claims "instead of assuming
 * 'no source'", and names two hosts R7 never touched: the **Legislative
 * Department** and the **official Gazette / eGazette**. It also makes the CrPC
 * verdict worth re-testing, because "every EXACT-TITLE item has zero
 * bitstreams" is a statement about one query, not about the source.
 *
 * ## The rule this probe will not break
 *
 * HTTP 200 with no usable content is `FAILED_SOURCE_SHAPE`, never success. R7
 * hit exactly that: `indiacode.gov.in/handle/...` returns 200 and an Angular
 * shell. Every verdict here is derived from bytes and content-type, never from
 * a status code.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-statute-source-probe-r8.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/statute-source-probe-r8.json';

const UA = 'LawMind-NEW2-source-probe/1.0 (legal research corpus; contact via repo)';
const TIMEOUT_MS = 25_000;
/** One request at a time, spaced. A probe must not look like a harvest. */
const SPACING_MS = 1_200;

type Probe = {
  label: string;
  url: string;
  status: number | null;
  contentType: string | null;
  bytes: number;
  verdict: string;
  evidence?: string;
  error?: string;
};

const probes: Probe[] = [];
let lastCall = 0;

async function politeFetch(url: string, accept = 'application/json, text/html;q=0.8'): Promise<Response | null> {
  const wait = SPACING_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ac.signal, redirect: 'follow' });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * A verdict from BYTES, never from a status code.
 *
 * The Angular shell that R7 met returns 200 with ~2.3 KB of bootstrap HTML.
 * Nothing about the status distinguishes it from a real page, so the shape does.
 */
function shapeVerdict(status: number, ct: string, bytes: number, body: string): string {
  if (status >= 400) return `HTTP_${status}`;
  if (/application\/(json|.*\+json)/.test(ct)) return 'JSON_OK';
  if (/application\/pdf/.test(ct)) return bytes > 8_000 ? 'PDF_OK' : 'PDF_SUSPICIOUSLY_SMALL';
  if (/text\/html/.test(ct)) {
    if (bytes < 6_000 && /<app-root|ng-version|__NEXT_DATA__/.test(body)) return 'FAILED_SOURCE_SHAPE — SPA shell, 200 with no content';
    if (bytes < 2_000) return 'FAILED_SOURCE_SHAPE — 200 with a near-empty body';
    return 'HTML_OK';
  }
  return `UNKNOWN_CONTENT_TYPE ${ct || '(none)'}`;
}

async function probe(label: string, url: string, accept?: string): Promise<Probe> {
  const res = await politeFetch(url, accept);
  if (!res) {
    const p: Probe = { label, url, status: null, contentType: null, bytes: 0, verdict: 'NO_RESPONSE — timeout, DNS or TLS failure', error: 'fetch failed' };
    probes.push(p);
    return p;
  }
  const ct = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  const body = buf.subarray(0, 4096).toString('utf8');
  const p: Probe = {
    label,
    url,
    status: res.status,
    contentType: ct,
    bytes: buf.byteLength,
    verdict: shapeVerdict(res.status, ct, buf.byteLength, body),
    evidence: body.replace(/\s+/g, ' ').slice(0, 220),
  };
  probes.push(p);
  return p;
}

async function main() {
  console.log('R8.1 §7.15 — probing official statute sources. Read-only, ~1.2s apart.\n');

  // ---- 1. India Code DSpace 7 REST, SEARCH rather than exact title -------
  // R7's CrPC verdict rests on exact-title items having zero bitstreams. A
  // search API answers a different question: does the source hold ANY item
  // whose bitstreams carry this Act, under any title or state adaptation?
  const dspace = 'https://indiacode.gov.in/server/api';
  const searches = [
    ['CrPC — discover, free text', `${dspace}/discover/search/objects?query=Criminal%20Procedure%201973&size=5`],
    ['CrPC — discover, act number 2 of 1974', `${dspace}/discover/search/objects?query=%222%20of%201974%22&size=5`],
    ['IPC — discover, act number 45 of 1860', `${dspace}/discover/search/objects?query=%2245%20of%201860%22&size=5`],
    ['IEA — discover, act number 1 of 1872', `${dspace}/discover/search/objects?query=%221%20of%201872%22&size=5`],
  ];
  for (const [label, url] of searches) {
    const p = await probe(label, url);
    console.log(`  ${p.verdict.padEnd(46)} ${p.bytes.toString().padStart(8)}B  ${label}`);
    if (p.verdict === 'JSON_OK') {
      try {
        const j = JSON.parse((await (await politeFetch(url))!.text()) || '{}');
        const total = j?.page?.totalElements ?? j?._embedded?.searchResult?.page?.totalElements ?? null;
        p.evidence = `totalElements=${total}`;
        console.log(`      -> totalElements ${total}`);
      } catch { /* shape recorded above; parse failure is itself the evidence */ }
    }
  }

  // ---- 2. Legislative Department — never probed by this repo -------------
  const legislative = [
    ['Legislative Dept — root', 'https://legislative.gov.in/'],
    ['Legislative Dept — A2Z index of central Acts', 'https://legislative.gov.in/documents/acts/'],
    ['Legislative Dept — alternate host', 'https://www.indiacode.nic.in/'],
  ];
  for (const [label, url] of legislative) {
    const p = await probe(label, url, 'text/html');
    console.log(`  ${p.verdict.padEnd(46)} ${p.bytes.toString().padStart(8)}B  ${label}`);
  }

  // ---- 3. eGazette — never probed by this repo --------------------------
  const gazette = [
    ['eGazette — root', 'https://egazette.gov.in/'],
    ['eGazette — search entry', 'https://egazette.gov.in/(S(x))/Default.aspx'],
  ];
  for (const [label, url] of gazette) {
    const p = await probe(label, url, 'text/html');
    console.log(`  ${p.verdict.padEnd(46)} ${p.bytes.toString().padStart(8)}B  ${label}`);
  }

  const report = {
    artifact: 'NEW2_STATUTE_SOURCE_PROBE_R8',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.15',
    generated_at: new Date().toISOString(),
    writes_to_statutes_tables: 0,
    downloads: 0,
    supersedes_nothing: 'R7 STATUTE_ACQUISITION_PROBE_V1 stands; this adds the two hosts it never touched',
    rule_applied: 'HTTP 200 with no usable content is FAILED_SOURCE_SHAPE, never success',
    probes,
    r7_verdicts_carried_forward: {
      ipc: 'PARTIAL — Chandigarh item, ss. 1-120B, 115 sections parsed',
      iea_modern: 'COMPLETE document, 171 of 183 sections parsed, 0 fabricated',
      iea_1872_original: 'PROVEN_DAMAGED — 1872 print scan, OCR unusable',
      crpc: 'NOT AVAILABLE on exact-title matching — re-tested here by search',
    },
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nwritten ${OUT}`);
  console.log(`${probes.filter((p) => /OK/.test(p.verdict)).length} of ${probes.length} probes returned usable content.`);
}

await main();
