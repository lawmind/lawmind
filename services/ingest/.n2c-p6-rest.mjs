/**
 * NEW2 §8/NEW2-6 — WHERE THE CENTRAL ACTS ACTUALLY LIVE ON THE NEW HOST.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A ONE-LINE DOMAIN FIX WOULD HAVE BEEN WORSE THAN THE 404
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * India Code moved from `indiacode.nic.in` to `indiacode.gov.in`; the old host
 * now serves a 3-second meta-refresh migration notice. Our `actListingUrl` still
 * points at the old host, which is why the 23 Aug probe saw a 404.
 *
 * But the new host runs **DSpace 9.1 with an Angular front end**, and every HTML
 * path there returns the SAME 2,338-byte JavaScript shell — `/browse/title`,
 * `/handle/123456789/1362`, and the legacy JSP browse URL all answer 200 with
 * byte-identical content. `parseActListing` would find zero handles in it, and
 * `acts-cli.ts` walks *"until it stops yielding new handles"* — so it would stop
 * at offset 0 and report a clean, successful, EMPTY run.
 *
 * That is this repo's soft-404 lesson in a new costume: a 200 that is not an
 * answer. Changing only the domain would have converted a loud failure into a
 * silent one.
 *
 * The real route is the REST API under `/server/api`, which answers JSON.
 *
 * DISCIPLINE: a short NAMED sequence, spaced, recorded, nothing acquired.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://indiacode.gov.in/server/api';
const SPACING_MS = 5_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = [];
async function get(label, url) {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'LawMind/1.0 (statute acquisition)' },
      signal: AbortSignal.timeout(25_000),
    });
    const ct = res.headers.get('content-type') ?? '';
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    const rec = { label, url, status: res.status, content_type: ct, ms: Date.now() - t, bytes: text.length, json_ok: json !== null };
    log.push(rec);
    console.log(`${String(res.status).padEnd(4)} ${rec.ms}ms  ${label}  ${ct} ${text.length}B`);
    await sleep(SPACING_MS);
    return json;
  } catch (e) {
    log.push({ label, url, error: String(e), ms: Date.now() - t });
    console.log(`ERR  ${Date.now() - t}ms  ${label}  ${String(e)}`);
    await sleep(SPACING_MS);
    return null;
  }
}

const findings = { probed_at: new Date().toISOString(), base: BASE };

// 1. Top-level communities. "Central Acts" should be one of them.
const comms = await get('communities_top', `${BASE}/core/communities/search/top?size=40`);
const list = comms?._embedded?.communities ?? [];
findings.top_communities = list.map((c) => ({ name: c.name, handle: c.handle, uuid: c.uuid, items: c.archivedItemsCount }));
console.log('\ntop communities:');
for (const c of findings.top_communities) console.log(`   ${String(c.handle).padEnd(20)} ${c.name}`);

// 2. The Central Acts community, by name match on what came back.
/* The community is named `CENTRAL`, not "Central Acts", and its handle is
 * 123456789/1 -- NOT the 123456789/1362 our indiacode.ts has hardcoded. So the
 * handle moved as well as the host, and a domain-only fix would have pointed a
 * working client at a community that no longer exists under that id. */
const central = list.find((c) => /^central$/i.test((c.name ?? '').trim()))
             ?? list.find((c) => /central act/i.test(c.name ?? ''));
findings.central_acts = central ? { name: central.name, handle: central.handle, uuid: central.uuid } : null;

if (central) {
  // 3. Its collections — the acts are items inside these.
  const cols = await get('central_collections', `${BASE}/core/communities/${central.uuid}/collections?size=40`);
  findings.central_collections = (cols?._embedded?.collections ?? []).map((c) => ({
    name: c.name, handle: c.handle, uuid: c.uuid,
  }));
  console.log('\ncentral acts collections:');
  for (const c of findings.central_collections ?? []) console.log(`   ${String(c.handle).padEnd(20)} ${c.name}`);

  // 4. A bounded discovery search scoped to that community, to see item shape
  //    and the TOTAL — the number that tells us whether the whole library is
  //    reachable this way.
  const disc = await get(
    'discover_scoped',
    `${BASE}/discover/search/objects?scope=${central.uuid}&dsoType=item&size=5`,
  );
  const page = disc?._embedded?.searchResult?.page;
  findings.central_item_total = page?.totalElements ?? null;
  const first = disc?._embedded?.searchResult?._embedded?.objects ?? [];
  findings.sample_items = first.slice(0, 5).map((o) => {
    const i = o._embedded?.indexableObject ?? {};
    return { name: i.name, handle: i.handle, uuid: i.uuid };
  });
  console.log(`\nitems in Central Acts scope: ${findings.central_item_total}`);
  for (const s of findings.sample_items) console.log(`   ${String(s.handle).padEnd(20)} ${s.name}`);
}

findings.requests = log;
writeFileSync('docs/ai/new2/indiacode-rest-discovery.json', JSON.stringify(findings, null, 2));
console.log('\nwrote docs/ai/new2/indiacode-rest-discovery.json');
