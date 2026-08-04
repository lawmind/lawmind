/**
 * OD-4 Stage 2 — BNS / BNSS / BSA from indiacode.nic.in.
 *
 *   pnpm --filter @lawmind/ingest statutes [--handle 123456789/20062 ...]
 *
 * Resumable on `statutes.act_id` and `(statute_id, section_number)`, so a killed
 * run re-writes rather than duplicating.
 *
 * This ingests statutory TEXT only. It does NOT populate `statute_mappings` —
 * indiacode publishes no IPC↔BNS correspondence, and `DOMAIN_TRUTH.md` forbids
 * generating one. See `docs/DATASETS.md`.
 */
import type postgres from 'postgres';

import {
  actUrl,
  parseActPage,
  parseSectionContent,
  parseSectionRefs,
  sectionContentUrl,
  type ActRecord,
  type SectionRecord,
} from './indiacode.ts';

/**
 * The three codes that replaced IPC, CrPC and the Evidence Act on 1 July 2024.
 *
 * Handles were resolved against the site, not guessed — a first guess had BNSS
 * and BSA transposed and pointed one at the Post Office Act. indiacode also holds
 * state-administration copies and a draft of each code under separate handles,
 * all carrying the same short title and act number but **zero sections**, so the
 * title alone does not identify the Central Act.
 *
 * `expectMinistry` is the discriminator that does: the Central codes are Ministry
 * of Home Affairs, the copies are state administrations.
 */
export const CRIMINAL_CODE_HANDLES = [
  { handle: '123456789/20062', expectTitle: 'Bharatiya Nyaya Sanhita' },
  { handle: '123456789/20099', expectTitle: 'Bharatiya Nagarik Suraksha Sanhita' },
  { handle: '123456789/20063', expectTitle: 'Bharatiya Sakshya Adhiniyam' },
] as const;

export const EXPECTED_MINISTRY = 'Ministry of Home Affairs';

/**
 * Refuses an Act that is not the one asked for. Ingesting a state copy or a draft
 * under the name of a Central code would put the wrong statutory text behind every
 * BNS answer, which is the failure `DOMAIN_TRUTH.md` exists to prevent.
 */
export function assertExpectedAct(act: ActRecord, expectTitle: string): void {
  if (!act.shortTitle.toLowerCase().includes(expectTitle.toLowerCase())) {
    throw new Error(`expected "${expectTitle}", got "${act.shortTitle}"`);
  }
  if (act.ministry !== EXPECTED_MINISTRY) {
    throw new Error(
      `"${act.shortTitle}" is published by "${String(act.ministry)}", not ${EXPECTED_MINISTRY} — ` +
        'this is a state copy or a draft, not the Central Act',
    );
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * indiacode rate-limits and answers with a 403 "Access Denied" HTML page rather
 * than a 429. Observed intermittently at concurrency 6: section 1 succeeded,
 * section 2 was refused, section 3 succeeded. So a refusal is retried with
 * backoff rather than treated as absence — a section that exists but was throttled
 * must never end up recorded as a section that does not exist.
 */
async function politeFetch(url: string, attempts = 4): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    lastStatus = res.status;
    if (res.status !== 403 && res.status !== 429 && res.status < 500) break;
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw new Error(`GET ${url} → ${lastStatus}`);
}

async function getText(url: string): Promise<string> {
  return (await politeFetch(url)).text();
}

export async function fetchAct(handle: string): Promise<{ act: ActRecord; html: string }> {
  const html = await getText(actUrl(handle));
  return { act: parseActPage(html, handle), html };
}

export type SectionFetch = { sections: SectionRecord[]; missing: string[] };

/**
 * Concurrency 2 by default: this is a government site serving a public good, and
 * 6 provoked refusals. A statute ingest is a one-off, so patience costs nothing.
 *
 * A section that still fails after retries is reported in `missing`, never
 * silently omitted — a BNS with a hole in it is worse than one that failed to
 * load, because the hole is invisible to the advocate looking up that section.
 */
export async function fetchSections(
  actId: string,
  actHtml: string,
  concurrency = 2,
): Promise<SectionFetch> {
  const refs = parseSectionRefs(actHtml);
  const out: SectionRecord[] = new Array(refs.length);
  const missing: string[] = [];

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, refs.length) }, async () => {
    for (;;) {
      const i = next++;
      const ref = refs[i];
      if (!ref) return;
      // One request per section. The heading and the canonical URL already came
      // from the Act page.
      try {
        const res = await politeFetch(sectionContentUrl(actId, ref.sectionId));
        const { text, footnote } = parseSectionContent(await res.json());
        if (text.length === 0) {
          missing.push(ref.sectionNumber);
          continue;
        }
        out[i] = {
          sectionNumber: ref.sectionNumber,
          heading: ref.heading,
          sectionText: text,
          footnote,
          orderIndex: ref.orderIndex,
          sourceUrl: ref.sourceUrl,
        };
      } catch {
        missing.push(ref.sectionNumber);
      }
    }
  });
  await Promise.all(workers);
  return { sections: out.filter((s): s is SectionRecord => s !== undefined), missing };
}

export async function upsertAct(
  sql: postgres.Sql,
  act: ActRecord,
  sections: SectionRecord[],
): Promise<{ statuteId: string; sections: number }> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO statutes ${tx({
        act_id: act.actId,
        short_title: act.shortTitle,
        hindi_title: act.hindiTitle,
        act_number: act.actNumber,
        act_year: act.actYear,
        enactment_date: act.enactmentDate,
        enforcement_date: act.enforcementDate,
        ministry: act.ministry,
        source_url: act.sourceUrl,
      })}
      ON CONFLICT (act_id) DO UPDATE SET
        short_title = EXCLUDED.short_title,
        hindi_title = EXCLUDED.hindi_title,
        act_number = EXCLUDED.act_number,
        act_year = EXCLUDED.act_year,
        enactment_date = EXCLUDED.enactment_date,
        enforcement_date = EXCLUDED.enforcement_date,
        ministry = EXCLUDED.ministry,
        source_url = EXCLUDED.source_url
      RETURNING id
    `;
    const statuteId = row?.id;
    if (!statuteId) throw new Error(`upsert of ${act.shortTitle} returned no id`);

    const withText = sections.filter((s) => s.sectionText.length > 0);
    if (withText.length > 0) {
      await tx`
        INSERT INTO statute_sections ${tx(
          withText.map((s) => ({
            statute_id: statuteId,
            section_number: s.sectionNumber,
            heading: s.heading,
            section_text: s.sectionText,
            footnote: s.footnote,
            order_index: s.orderIndex,
            source_url: s.sourceUrl,
          })),
        )}
        ON CONFLICT (statute_id, section_number) DO UPDATE SET
          heading = EXCLUDED.heading,
          section_text = EXCLUDED.section_text,
          footnote = EXCLUDED.footnote,
          order_index = EXCLUDED.order_index,
          source_url = EXCLUDED.source_url
      `;
    }
    return { statuteId, sections: withText.length };
  });
}
