/**
 * NEW2 §8/NEW2-6 — RE-DERIVE INDIA CODE'S BROWSE PATH, CONSERVATIVELY.
 *
 * The 23 Aug probe found root 200 / listing 404. A 404 is not an outage: it says
 * the PATH moved and our URL builder (`indiacode.ts:actListingUrl`) is stale.
 *
 * India Code runs DSpace. DSpace 7 replaced the JSP `/handle/<h>/browse?type=…`
 * route with an Angular UI plus a REST API under `/server/api/…`, which is the
 * single most likely cause of a 404 on exactly that path while the root still
 * answers. This probes that hypothesis and its neighbours.
 *
 * DISCIPLINE, because this is someone else's server:
 *   - a small NAMED list of candidate paths, never a crawl;
 *   - one request at a time, spaced;
 *   - HEAD-equivalent bytes only (we read at most a few KB and do not follow
 *     into content);
 *   - everything RECORDED, nothing acted on. No acquisition happens here.
 *
 * A soft 404 is a real hazard on this class of site — this repo has already been
 * bitten by a 200 carrying 124 bytes of HTML with `Content-Type: application/pdf`
 * — so status alone is not the verdict. Content-type and a shape test are
 * recorded beside it.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://indiacode.gov.in';
const HANDLE = '123456789/1362'; // Central Acts community, per indiacode.ts
const SPACING_MS = 6_000;

/** Named candidates, in the order a DSpace upgrade would have moved things. */
const CANDIDATES = [
  { label: 'root', url: `${BASE}/` },
  { label: 'dspace7_rest_root', url: `${BASE}/server/api` },
  { label: 'dspace7_rest_communities', url: `${BASE}/server/api/core/communities?size=20` },
  { label: 'dspace7_rest_search_by_handle', url: `${BASE}/server/api/pid/find?id=hdl:${HANDLE}` },
  { label: 'dspace7_angular_browse', url: `${BASE}/browse/title` },
  { label: 'dspace7_handle_page', url: `${BASE}/handle/${HANDLE}` },
  { label: 'legacy_jsp_browse', url: `${BASE}/handle/${HANDLE}/browse?type=shorttitle&rpp=20&offset=0` },
  { label: 'dspace7_rest_discover', url: `${BASE}/server/api/discover/search/objects?size=5` },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (const c of CANDIDATES) {
  const t = Date.now();
  let rec;
  try {
    const res = await fetch(c.url, {
      redirect: 'follow',
      headers: { accept: 'application/json, text/html;q=0.9', 'user-agent': 'LawMind/1.0 (statute acquisition; contact via indiacode terms)' },
      signal: AbortSignal.timeout(20_000),
    });
    const ct = res.headers.get('content-type') ?? '';
    const body = (await res.text()).slice(0, 4000);
    rec = {
      label: c.label,
      url: c.url,
      status: res.status,
      final_url: res.url,
      content_type: ct,
      ms: Date.now() - t,
      bytes_read: body.length,
      /* Shape tests, not status tests. A soft 404 serves 200. */
      looks_json: ct.includes('json') && /^[\s]*[[{]/.test(body),
      mentions_dspace: /dspace/i.test(body),
      has_handle_links: /handle\/123456789/.test(body),
      has_browse_links: /\/browse[\/?]/.test(body),
      head: body.slice(0, 300).replace(/\s+/g, ' '),
    };
  } catch (e) {
    rec = { label: c.label, url: c.url, error: String(e), ms: Date.now() - t };
  }
  results.push(rec);
  console.log(
    `${String(rec.status ?? 'ERR').padEnd(4)} ${rec.ms}ms  ${c.label.padEnd(28)} ${rec.content_type ?? rec.error ?? ''}`,
  );
  if (rec.final_url && rec.final_url !== c.url) console.log(`       -> redirected to ${rec.final_url}`);
  await sleep(SPACING_MS);
}

writeFileSync(
  'docs/ai/new2/indiacode-route-probe-gov.json',
  JSON.stringify(
    {
      probed_at: new Date().toISOString(),
      policy: `${CANDIDATES.length} named candidates, ${SPACING_MS / 1000}s apart, recorded not acted on. No acquisition.`,
      results,
    },
    null,
    2,
  ),
);
console.log('\nwrote docs/ai/new2/indiacode-route-probe-gov.json');
