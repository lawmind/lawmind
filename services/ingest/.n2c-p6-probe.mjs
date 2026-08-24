/**
 * NEW2 P6 — ONE conservative India Code availability probe.
 *
 * §8/NEW2-6: retry conservatively when the service returns; do not hammer a
 * failing government service. So: two requests, sequential, 20s apart, and the
 * result is recorded rather than acted on. A 200 on the root page is not
 * evidence the document endpoints work -- that is what FQ-INDIACODE-AVAILABILITY
 * recorded as a 504 outage, and the listing endpoint is the one that matters.
 */
import { writeFileSync } from 'node:fs';
import { actListingUrl, CENTRAL_ACTS_HANDLE, INDIA_CODE } from './src/indiacode.ts';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const probe = async (label, url) => {
  const t = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'LawMind/1.0 (research; contact via repo)' } });
    const body = await res.text();
    return { label, url, status: res.status, ms: Date.now() - t, bytes: body.length,
             looks_like_listing: /Central Acts|handle|community-browser|browse/i.test(body) };
  } catch (e) {
    return { label, url, error: String(e.message ?? e), ms: Date.now() - t };
  }
};

const out = [];
out.push(await probe('root', INDIA_CODE + '/'));
console.log(JSON.stringify(out[0]));
await sleep(20000);
out.push(await probe('central_acts_listing', actListingUrl(0, 20)));
console.log(JSON.stringify(out[1]));

writeFileSync('docs/ai/new2/indiacode-availability.json', JSON.stringify({
  probed_at: new Date().toISOString(),
  handle: CENTRAL_ACTS_HANDLE,
  requests: out.length,
  policy: 'two requests, 20s apart, recorded not acted on',
  results: out,
}, null, 2));
console.log('wrote docs/ai/new2/indiacode-availability.json');
