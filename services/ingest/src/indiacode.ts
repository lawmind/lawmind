/**
 * indiacode.nic.in — Central Acts, section by section.
 *
 * Primary source, government-published. `docs/DATASETS.md` records what this
 * source does and does not provide, verified against the site: it carries the
 * Acts and their sections, but **no IPC↔BNS correspondence table**, so
 * `statute_mappings` is not populated from here and is not derived.
 *
 * Nothing in this module infers a legal fact. It reads published fields and
 * published section text.
 */
export const INDIA_CODE = 'https://www.indiacode.nic.in';

export type ActRecord = {
  actId: string;
  shortTitle: string;
  hindiTitle: string | null;
  actNumber: string;
  actYear: number;
  enactmentDate: string | null;
  enforcementDate: string | null;
  ministry: string | null;
  sourceUrl: string;
};

export type SectionRecord = {
  sectionNumber: string;
  heading: string | null;
  sectionText: string;
  footnote: string | null;
  orderIndex: number;
  sourceUrl: string;
};

export function actUrl(handle: string): string {
  return `${INDIA_CODE}/handle/${handle}`;
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    lsquo: '‘',
    ldquo: '“',
    rdquo: '”',
  };
  return text
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

/** indiacode prints dates as `DD-MM-YYYY` or `D-M-YYYY`, and sometimes `YYYY-MM-DD`. */
export function parseIndiaCodeDate(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return t;
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (!dmy) return null;
  const [, d, m, y] = dmy;
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/** Reads the labelled metadata table on an Act record page. */
export function parseActPage(html: string, handle: string): ActRecord {
  const fields = new Map<string, string>();
  const cell =
    /<td[^>]*class="metadataFieldLabel"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="metadataFieldValue"[^>]*>([\s\S]*?)<\/td>/gi;
  for (const m of html.matchAll(cell)) {
    fields.set(
      stripTags(m[1] ?? '')
        .replace(/:$/, '')
        .trim(),
      stripTags(m[2] ?? ''),
    );
  }

  const actId =
    /act_id\s*=\s*'([^']+)'/.exec(html)?.[1] ?? /actid=([A-Za-z0-9_.-]+)/.exec(html)?.[1];
  if (!actId) throw new Error(`no actid found on ${handle}`);

  const shortTitle = fields.get('Short Title');
  const actNumber = fields.get('Act Number');
  const actYear = fields.get('Act Year');
  if (!shortTitle || !actNumber || !actYear) {
    throw new Error(`incomplete Act metadata on ${handle}: ${[...fields.keys()].join(', ')}`);
  }

  return {
    actId,
    shortTitle,
    hindiTitle: fields.get('Hindi Title') ?? null,
    actNumber,
    actYear: Number(actYear),
    enactmentDate: parseIndiaCodeDate(fields.get('Enactment Date') ?? ''),
    enforcementDate: parseIndiaCodeDate(fields.get('Enforcement Date') ?? ''),
    ministry: fields.get('Ministry') ?? null,
    sourceUrl: actUrl(handle),
  };
}

export type SectionRef = {
  sectionId: string;
  sectionNumber: string;
  orderIndex: number;
  heading: string | null;
  /** The site's own href, kept verbatim rather than reconstructed. */
  sourceUrl: string;
};

/**
 * The section index on an Act page: id, printed number, the Act's own order, and
 * the heading — which is already printed here as `Section 63. Rape.`.
 *
 * Taking the heading from this page rather than from each section page removes
 * one HTTP request per section: 1,059 across the three criminal codes.
 */
export function parseSectionRefs(html: string): SectionRef[] {
  const refs: SectionRef[] = [];
  const seen = new Set<string>();
  const anchor =
    /<a[^>]*href=([^ >]*sectionId=(\d+)&sectionno=([^&"' >]+)[^ >]*)[^>]*>([\s\S]*?)<\/a>/g;

  for (const m of html.matchAll(anchor)) {
    const sectionId = m[2]!;
    if (seen.has(sectionId)) continue;
    const href = decodeEntities(m[1]!.replace(/^["']|["']$/g, ''));
    const orderno = /orderno=(\d+)/.exec(href)?.[1];
    if (orderno === undefined) continue;
    seen.add(sectionId);

    const sectionNumber = decodeEntities(m[3]!).trim();
    refs.push({
      sectionId,
      sectionNumber,
      orderIndex: Number(orderno),
      heading: parseHeading(stripTags(m[4] ?? ''), sectionNumber),
      sourceUrl: href.startsWith('http') ? href : `${INDIA_CODE}${href}`,
    });
  }
  return refs;
}

/** `Section 63. Rape.` → `Rape`. Null when the label carries no heading. */
export function parseHeading(label: string, sectionNumber: string): string | null {
  const escaped = sectionNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s*Section\\s+${escaped}\\.?\\s*(.+?)\\.?\\s*$`, 'i').exec(label);
  const heading = m?.[1]?.trim().replace(/\.$/, '').trim();
  return heading && heading.length > 0 ? heading : null;
}

export function sectionContentUrl(actId: string, sectionId: string): string {
  return `${INDIA_CODE}/SectionPageContent?&actid=${actId}&sectionID=${sectionId}`;
}

/** `/SectionPageContent` returns `{ content, footnote }`, both HTML fragments. */
export function parseSectionContent(payload: unknown): { text: string; footnote: string | null } {
  const body = payload as { content?: unknown; footnote?: unknown };
  const text = stripTags(typeof body.content === 'string' ? body.content : '');
  const footnoteRaw = stripTags(typeof body.footnote === 'string' ? body.footnote : '');
  return { text, footnote: footnoteRaw.length > 0 ? footnoteRaw : null };
}
