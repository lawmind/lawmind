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
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  /**
   * The browse index serves the month by name — `25-Mar-2016` — while an Act's
   * own record page serves it numerically. Same site, two formats, and the
   * numeric-only parser silently returned null for every row of the index.
   */
  const named = /^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/.exec(t);
  if (!named) return null;
  const [, d, monthName, y] = named;
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const idx = months.indexOf(monthName!.slice(0, 3).toLowerCase());
  // An unrecognised month is a parse failure, never a guessed date.
  if (idx === -1) return null;
  return `${y}-${String(idx + 1).padStart(2, '0')}-${d!.padStart(2, '0')}`;
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

  /**
   * Three sources, in order of preference. The first two are the structured id
   * indiacode's own JS uses to build `sectionContentUrl` — `AC_CEN_2_2_00042_
   * 196252_...` — and are what nearly every Act carries. A cluster of older,
   * sectionless Acts (`The Bengal Bonded Warehouse Association Act, 1854` was
   * the one that surfaced this) has neither: no `act_id='...'` JS assignment
   * and no `actid=` query param anywhere on the page, because the page has no
   * section links to build those URLs for in the first place — confirmed
   * against three of these pages, all zero `sectionId=` occurrences.
   *
   * All of them DO carry a plain "Act ID" row in the same metadata table
   * `shortTitle`/`actNumber`/`actYear` already come from, e.g. `185405`. It
   * cannot build a `sectionContentUrl` — it is not the same identifier
   * namespace — but that is moot for an Act with no sections to fetch, and
   * using it is strictly better than failing an Act indiacode does publish.
   */
  const actId =
    /act_id\s*=\s*'([^']+)'/.exec(html)?.[1] ??
    /actid=([A-Za-z0-9_.-]+)/.exec(html)?.[1] ??
    fields.get('Act ID');
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

/**
 * Some Acts list the same section number twice under two different
 * `sectionId`s — indiacode's own duplicate listing, not two provisions that
 * happen to share a number. The Customs Act 1962's s.79 and the Delhi
 * Municipal Corporation Act 1957's s.271/s.282 are the confirmed cases: same
 * heading, adjacent `orderIndex`, byte-identical section text (checked before
 * writing this). `(statute_id, section_number)` is unique in
 * `statute_sections`, so a batch containing both throws "ON CONFLICT DO
 * UPDATE command cannot affect row a second time" and fails the WHOLE Act —
 * this is what actually blocked these two, discovered only after fixing the
 * separate `actId` bug let them get this far.
 *
 * Keeps the lower `orderIndex` — the site's own first listing — and names
 * every dropped duplicate, never silently thinning the section count.
 */
export function dedupeSectionRefs(refs: SectionRef[]): {
  refs: SectionRef[];
  duplicates: string[];
} {
  const bySectionNumber = new Map<string, SectionRef>();
  const duplicates: string[] = [];
  for (const ref of refs) {
    const existing = bySectionNumber.get(ref.sectionNumber);
    if (!existing) {
      bySectionNumber.set(ref.sectionNumber, ref);
    } else if (ref.orderIndex < existing.orderIndex) {
      bySectionNumber.set(ref.sectionNumber, ref);
      duplicates.push(ref.sectionNumber);
    } else {
      duplicates.push(ref.sectionNumber);
    }
  }
  return { refs: [...bySectionNumber.values()], duplicates };
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

/**
 * One Act as listed in the Central Acts browse index.
 *
 * Only what the index publishes. The full record — ministry, enforcement date,
 * Hindi title — comes from the Act's own page via `parseActPage`, because the
 * index does not carry it and inferring it would be inventing.
 */
export type ActListing = {
  handle: string;
  shortTitle: string;
  actNumber: string | null;
  dateIssued: string | null;
};

/** The Central Acts community. Its browse index is the only enumerable list. */
export const CENTRAL_ACTS_HANDLE = '123456789/1362';

/**
 * Parse one page of the `browse?type=shorttitle` index.
 *
 * DSpace renders it as a table: date issued, act number, short title, and a
 * "View..." link carrying the handle. The handle is the only durable identifier —
 * short titles repeat across amendment Acts and act numbers restart every year.
 */
export function parseActListing(html: string): ActListing[] {
  const out: ActListing[] = [];
  // Rows are not newline-delimited in the served markup, so split on the row tag
  // rather than on lines.
  for (const row of html.split(/<tr[^>]*>/i)) {
    const handle = /href="\/handle\/(123456789\/\d+)\?view_type=browse"/.exec(row)?.[1];
    if (!handle) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      decodeEntities(m[1]!.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim(),
    );
    const [dateIssued, actNumber, shortTitle] = cells;
    if (!shortTitle) continue;
    out.push({
      handle,
      shortTitle,
      actNumber: actNumber && actNumber.length > 0 ? actNumber : null,
      dateIssued: dateIssued ? parseIndiaCodeDate(dateIssued) : null,
    });
  }
  return out;
}

/** Total Acts the index reports, from its own "100 of 845" counter. */
export function parseListingTotal(html: string): number | null {
  const m = /(\d[\d,]*)\s+of\s+(\d[\d,]*)/.exec(html);
  return m?.[2] ? Number(m[2].replace(/,/g, '')) : null;
}

export function actListingUrl(offset: number, perPage = 100): string {
  return `${INDIA_CODE}/handle/${CENTRAL_ACTS_HANDLE}/browse?type=shorttitle&rpp=${perPage}&offset=${offset}`;
}
