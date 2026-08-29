/**
 * The cause-list parser, written against ONE real authorised response.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE FIXTURE IS AND WHY EVERY SELECTOR HERE POINTS AT IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `__fixtures__/ecourts-cause-list-module-index-2026-08-29.html` is the response
 * to the first authorised request ever made under the registrar's grant:
 * 75,405 bytes, `text/html; charset=utf-8`, sha256
 * `4ae6bbe1c19824964ca3705c724561c1e8506b51e6fc42147832aef958566e94`, retained
 * append-only in `official_source_artifact` and reproduced byte-for-byte here so
 * this file's tests do not depend on the database.
 *
 * `CLAUDE.md` forbids inventing a schema, and a plausibly-wrong cause-list
 * parser is the most dangerous object this product can produce, because the
 * briefing goes out either way. So every string this module matches on is
 * quoted from that response. Nothing is guessed, and where the response does
 * not tell us something, this refuses instead of assuming.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE RESPONSE ACTUALLY SAID
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **The request identity is five dimensions and a date**, and the page states
 *    them in its own instructions: *"1. Select State, District and Court Complex
 *    of the Cause list to be displayed. 2. Select the entry from the Court Name
 *    Select box... 3. Select the Cause list Date... 5. Click on the Civil or
 *    Criminal button."* The form carries `sess_state_code`, `sees_dist_code`,
 *    `court_complex_code`, `court_est_code`, `CL_court_no` and
 *    `causelist_date`. That is `DistrictSourceKey`, confirmed by the source
 *    rather than modelled from it.
 *
 * 2. **A CAPTCHA is mandatory.** Step 4 of the same instructions: *"Enter the
 *    Captcha (the 5 digit numbers shown on the screen) in the text box
 *    provided."* The field is `cause_list_captcha_code`, and the image is served
 *    by `vendor/securimage/securimage_show.php`, with an audio alternative.
 *
 * 3. **The results container is filled by AJAX and is empty on arrival** —
 *    `<div id="CauseList"></div>` and
 *    `<div id="caseBusinessDiv_CauseList" style="display:none"></div>`. Both ids
 *    are quoted from the fixture, the second confirmed by the Print button's own
 *    `printContent('caseBusinessDiv_CauseList')`.
 *
 * 4. **The result vocabulary is published in the page itself.** The page ships a
 *    translation dictionary, and it contains the labels a result uses: `Sr No`,
 *    `Case Number`, `Party Name`, `Petitioner`, `Respondent`, `Next Hearing
 *    Date`, `Case Stage`, `Total number of cases`, `versus`, `View`, and
 *    `Record not found`. That is why the header matching below is not a guess:
 *    the source told us its own column names, even though we have not yet seen
 *    them arranged in a table.
 *
 * 5. **The court's own uncertainty is printed at the top of the form**, and it
 *    is the first thing the form says: *"Cause list displayed may differ from
 *    the actual cause list. For further queries, contact court administrator."*
 *    That warning travels with every observation this parser produces. It is the
 *    source's statement about its own data and it must never be quietly dropped
 *    — a derived state of ours is not certified by the court, and the difference
 *    has to survive into the record.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR OUTCOMES, AND THE DISTINCTIONS BETWEEN THEM ARE THE PRODUCT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version of this file got that wrong, and the fixture caught it. The
 * observed response ships a translation dictionary inline, and that dictionary
 * contains the string `"Record not found"`; matching it anywhere in the document
 * made a CAPTCHA form parse as a court that had published nothing. Both the
 * empty marker and the row scan are now read from the results container only,
 * with scripts stripped. It is worth stating plainly because the bug was
 * invisible against any page written to test the parser and obvious against the
 * page the court actually sent.
 *
 * - `ok` — rows were read.
 * - `empty` — the source SAID there was nothing: it printed "Record not found".
 *   This is the only path to `empty`, because "the court published nothing" is a
 *   claim and only the court may make it.
 * - `failed` with a refusal code — everything else, including a results
 *   container that produced no rows without saying why (`parse_empty_unconfirmed`).
 *   An unread page is not a quiet Tuesday.
 * - Rows that were only half-read are kept with `extractionState: 'partial'` and
 *   a note, never dropped — the same rule as an unverified citation, for the
 *   same reason.
 */
import type { JSONValue } from 'postgres';

import type { ValidatedCauseListItem } from './ecourts-observation-writer.ts';

/** Bumped whenever extraction behaviour changes. Recorded on every observation. */
export const PARSER_VERSION = 'CAUSE_LIST_PARSER_V1_2026-08-29';

/** The fixture this parser was written against. Identity, not decoration. */
export const PARSER_FIXTURE = {
  path: 'services/api/src/court/__fixtures__/ecourts-cause-list-module-index-2026-08-29.html',
  sha256: '4ae6bbe1c19824964ca3705c724561c1e8506b51e6fc42147832aef958566e94',
  bytes: 75405,
  contentType: 'text/html; charset=utf-8',
  observedAt: '2026-08-29',
} as const;

/**
 * The court's own statement about its cause lists, quoted from the fixture.
 *
 * Matched as a phrase rather than reproduced from memory, and carried on every
 * observation parsed from a page that shows it.
 */
export const SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER =
  'Cause list displayed may differ from the actual cause list. For further queries, contact court administrator.';

export type ParseRefusal =
  /** The response is the form, and the form requires a CAPTCHA before any data. */
  | 'captcha_required'
  /** Recognisably an eCourts page, but not the cause-list surface. */
  | 'not_a_cause_list_response'
  /** PDF, image, or bytes we will not interpret. Retained, not read. */
  | 'unsupported_representation'
  /** A results container we could not map to the source's own column names. */
  | 'unrecognised_result_shape'
  /** A results container with no rows and no "Record not found". Not "no cases". */
  | 'parse_empty_unconfirmed';

export type ParseResult =
  | { status: 'ok'; items: ValidatedCauseListItem[]; sourceWarnings: string[] }
  | { status: 'empty'; sourceWarnings: string[] }
  | { status: 'failed'; error: string; refusal: ParseRefusal; sourceWarnings: string[] };

/**
 * What the licensed interface requires, read out of a response rather than
 * assumed. Consumed by the data-quality artifact and by the CAPTCHA report.
 */
export type CauseListInterfaceDescriptor = {
  isCauseListSurface: boolean;
  /** Form field names, in document order. */
  requestFields: string[];
  captcha: {
    required: boolean;
    /** The field the code is typed into, as the page names it. */
    field: string | null;
    /** The generator, from the image URL. `securimage` in the observed response. */
    mechanism: string | null;
    audioAlternative: boolean;
  };
  /** Container ids the results are written into. */
  resultContainers: string[];
  sourceWarnings: string[];
  /** Dimension select boxes the request needs, as the page names them. */
  dimensionSelects: string[];
};

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(v: string): string {
  return v
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#039;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What kind of thing did the source actually send?
 *
 * Decided from MAGIC BYTES first and the declared content type second. A soft
 * 404 that serves 124 bytes of HTML under `Content-Type: application/pdf` is a
 * shape this corpus has already been bitten by, and believing the header would
 * hand a parser an apology page to read as a document.
 */
export function detectRepresentation(
  body: Buffer,
  contentType: string | null,
): 'html' | 'json' | 'pdf' | 'unknown' {
  if (body.byteLength >= 5 && body.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = body.subarray(0, 2048).toString('utf8').trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  if (/^<(!doctype|html|\?xml)/i.test(head) || /<html[\s>]/i.test(head)) return 'html';
  const declared = (contentType ?? '').toLowerCase();
  if (declared.includes('json')) return 'json';
  if (declared.includes('html')) return 'html';
  if (declared.includes('pdf')) return 'pdf';
  return 'unknown';
}

/**
 * Read the interface out of a response. Never throws — an undescribable
 * response is described as one.
 */
export function describeCauseListInterface(html: string): CauseListInterfaceDescriptor {
  const causeListForm = /<form[^>]*id="frm_causelist"[^>]*>/i.test(html);
  const captchaField = /name="(cause_list_captcha_code)"/i.exec(html)?.[1] ?? null;
  const captchaImage = /id="captcha_image"[^>]*src="([^"]+)"/i.exec(html)?.[1] ?? null;
  const mechanism = captchaImage
    ? (/\/vendor\/([^/]+)\//.exec(captchaImage)?.[1] ?? 'unknown')
    : null;

  const requestFields = [
    ...html.matchAll(/<(?:input|select)[^>]*\sname=["']([^"']+)["'][^>]*>/gi),
  ].map((m) => m[1]!);
  const dimensionSelects = [...html.matchAll(/<select[^>]*\sid=["']([^"']+)["'][^>]*>/gi)].map(
    (m) => m[1]!,
  );
  const resultContainers = [
    ...html.matchAll(/<div[^>]*\sid="((?:caseBusinessDiv_)?CauseList)"[^>]*>/gi),
  ].map((m) => m[1]!);

  const sourceWarnings = html.includes(SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER)
    ? [SOURCE_WARNING_CAUSE_LIST_MAY_DIFFER]
    : [];

  return {
    isCauseListSurface: causeListForm || resultContainers.length > 0,
    requestFields: [...new Set(requestFields)],
    captcha: {
      required: captchaField !== null,
      field: captchaField,
      mechanism,
      audioAlternative: /id="captcha_image_audio"/i.test(html),
    },
    resultContainers: [...new Set(resultContainers)],
    sourceWarnings,
    dimensionSelects: [...new Set(dimensionSelects)],
  };
}

/**
 * The result columns, keyed by the label the SOURCE uses for them.
 *
 * Every left-hand string is quoted from the fixture's own translation
 * dictionary. Matching on the source's vocabulary is what makes this extraction
 * evidence-based rather than a guess about a table nobody has seen yet: if a
 * result page arrives whose headers are not in this list, `unrecognised_result_shape`
 * is the honest answer and the bytes are already safe.
 */
const COLUMN_LABELS: readonly (readonly [RegExp, keyof ColumnMap])[] = [
  [/^sr\.?\s*no\.?$/i, 'itemNumber'],
  [/^(case\s*number|case\s*no\.?)$/i, 'caseNumber'],
  [/^cnr(\s*number)?$/i, 'cnr'],
  [/^(party\s*name|petitioner\s*\/?\s*respondent|parties)$/i, 'parties'],
  [/^petitioner$/i, 'petitioner'],
  [/^respondent$/i, 'respondent'],
  [/^case\s*type$/i, 'caseType'],
  [/^case\s*year$/i, 'caseYear'],
  [/^case\s*stage$/i, 'stage'],
  [/^next\s*hearing\s*date$/i, 'nextHearingDate'],
  [/^advocate$/i, 'advocate'],
  [/^court\s*number$/i, 'courtNumber'],
];

type ColumnMap = {
  itemNumber?: number;
  caseNumber?: number;
  cnr?: number;
  parties?: number;
  petitioner?: number;
  respondent?: number;
  caseType?: number;
  caseYear?: number;
  stage?: number;
  nextHearingDate?: number;
  advocate?: number;
  courtNumber?: number;
};

function mapHeaders(cells: string[]): ColumnMap {
  const map: ColumnMap = {};
  cells.forEach((cell, index) => {
    for (const [pattern, key] of COLUMN_LABELS) {
      if (pattern.test(cell) && map[key] === undefined) {
        map[key] = index;
        return;
      }
    }
  });
  return map;
}

/**
 * Strip the parts of a document that are not what the user was shown.
 *
 * `<script>` in particular: the observed response ships a translation dictionary
 * inline, and that dictionary contains the string `"Record not found"`. Matching
 * it anywhere in the document made the parser read the CAPTCHA form as a court
 * that had published nothing — the precise failure this module exists to
 * prevent, found by running it against the real bytes rather than against a
 * page written to make it pass.
 */
function withoutScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * The inner HTML of an element by id, with nesting handled.
 *
 * A non-greedy match to the first `</div>` would truncate a filled results
 * container at its first nested element, which is worse than not looking: it
 * would silently halve a cause list.
 */
function elementInner(html: string, id: string): string | null {
  const open = new RegExp(`<(\\w+)[^>]*\\sid=["']${id}["'][^>]*>`, 'i');
  const match = open.exec(html);
  if (!match) return null;
  const tag = match[1]!.toLowerCase();
  const start = match.index + match[0].length;
  if (/\/>$/.test(match[0])) return '';

  const scan = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
  scan.lastIndex = start;
  let depth = 1;
  let found: RegExpExecArray | null;
  while ((found = scan.exec(html)) !== null) {
    depth += found[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, found.index);
  }
  // Unclosed. Everything after the opening tag is the best available answer,
  // and the caller's header matching will refuse it if it is not a table.
  return html.slice(start);
}

/**
 * Where the results live, if the page has somewhere for them.
 *
 * Scoping matters twice over: the empty marker must not be read out of a script
 * (above), and the row scan must not pick up the page's own furniture — the
 * observed response carries unrelated tables, and a visitor counter is not a
 * listing.
 */
function resultRegion(html: string): { region: string; scoped: boolean } {
  const clean = withoutScripts(html);
  const parts = ['CauseList', 'caseBusinessDiv_CauseList']
    .map((id) => elementInner(clean, id))
    .filter((v): v is string => v !== null);
  if (parts.length === 0) return { region: clean, scoped: false };
  return { region: parts.join('\n'), scoped: true };
}

function rowsOf(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1]!.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => text(cell[1]!)),
  );
}

function nullable(v: string | undefined): string | null {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Turn one authorised response into listings, or say honestly why not.
 *
 * `contentType` is advisory — see `detectRepresentation`.
 */
export function parseCauseList(body: Buffer, contentType: string | null = null): ParseResult {
  const representation = detectRepresentation(body, contentType);
  if (representation !== 'html') {
    return {
      status: 'failed',
      refusal: 'unsupported_representation',
      sourceWarnings: [],
      error:
        `the response is ${representation} (${body.byteLength} bytes, content-type ` +
        `${contentType ?? 'unstated'}); the only authorised cause-list response observed to date ` +
        'is HTML, and interpreting an unseen representation would be inventing a schema. The ' +
        'bytes are retained and this is readable later.',
    };
  }

  const html = body.toString('utf8');
  const descriptor = describeCauseListInterface(html);
  const sourceWarnings = descriptor.sourceWarnings;
  const { region } = resultRegion(html);
  const saysRecordNotFound = /record\s*not\s*found/i.test(text(region));

  if (!descriptor.isCauseListSurface) {
    return {
      status: 'failed',
      refusal: 'not_a_cause_list_response',
      sourceWarnings,
      error:
        `${body.byteLength} bytes of HTML with no cause-list form and no cause-list results ` +
        'container. Retained, and not read as a court that published nothing.',
    };
  }

  /**
   * Rows first, form second.
   *
   * The order matters: the results are written INTO the same page that carries
   * the form, so a page that has both is a page with results. Checking the
   * CAPTCHA first would refuse a response that had already answered.
   */
  const rows = rowsOf(region).filter((cells) => cells.length > 1);
  const headerIndex = rows.findIndex((cells) => Object.keys(mapHeaders(cells)).length >= 2);

  if (headerIndex === -1) {
    // No table we can read. Which of the two reasons applies is the whole point.
    if (saysRecordNotFound) return { status: 'empty', sourceWarnings };
    if (descriptor.captcha.required) {
      return {
        status: 'failed',
        refusal: 'captcha_required',
        sourceWarnings,
        error:
          `the licensed interface answered with its form, not with a list: field ` +
          `${descriptor.captcha.field} is required and the code is generated by ` +
          `${descriptor.captcha.mechanism ?? 'an unidentified generator'}` +
          `${descriptor.captcha.audioAlternative ? ' (an audio alternative is offered)' : ''}. ` +
          'No data is served before it is satisfied.',
      };
    }
    return {
      status: 'failed',
      refusal: 'parse_empty_unconfirmed',
      sourceWarnings,
      error:
        'a cause-list surface with no readable rows and no "Record not found". The source did ' +
        'not say the list was empty, so neither do we.',
    };
  }

  const columns = mapHeaders(rows[headerIndex]!);
  if (columns.caseNumber === undefined && columns.cnr === undefined) {
    return {
      status: 'failed',
      refusal: 'unrecognised_result_shape',
      sourceWarnings,
      error:
        `a results table was found but neither a case number nor a CNR column: headers were ` +
        `[${rows[headerIndex]!.join(' | ')}]. A listing that identifies no case cannot be ` +
        'attached to a matter, and inventing an identity is the failure this pipeline exists ' +
        'to prevent.',
    };
  }

  const items: ValidatedCauseListItem[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const at = (index: number | undefined): string | null =>
      index === undefined ? null : nullable(cells[index]);

    const cnr = at(columns.cnr);
    const caseNumber = at(columns.caseNumber);
    // A line naming no case is kept out of the observation table by the writer,
    // and skipped here rather than being turned into a refusal for the whole
    // page: a spacer row must not lose us the forty real ones around it.
    if (cnr === null && caseNumber === null) continue;

    const rawItem: Record<string, JSONValue> = { cells };
    rows[headerIndex]!.forEach((header, index) => {
      if (header) rawItem[header] = cells[index] ?? null;
    });

    const itemNumberText = at(columns.itemNumber);
    const itemNumber =
      itemNumberText !== null && /^\d+$/.test(itemNumberText) ? Number(itemNumberText) : null;
    const caseYearText = at(columns.caseYear);
    const caseYear =
      caseYearText !== null && /^\d{4}$/.test(caseYearText) ? Number(caseYearText) : null;

    /**
     * A row we could only half-read is written `partial` with the reason,
     * never dropped and never promoted. Missing columns are recorded as the
     * absence they are — never filled in from a neighbour.
     */
    const missing: string[] = [];
    if (columns.itemNumber !== undefined && itemNumber === null) missing.push('item number');
    if (columns.caseYear !== undefined && caseYear === null) missing.push('case year');

    items.push({
      cnr,
      caseNumber,
      caseType: at(columns.caseType),
      caseYear,
      courtNumber: at(columns.courtNumber),
      itemNumber,
      bench: null,
      raw: rawItem,
      extractionState: missing.length > 0 ? 'partial' : 'parsed',
      extractionNote:
        missing.length > 0 ? `unreadable in the source row: ${missing.join(', ')}` : null,
    });
  }

  if (items.length === 0) {
    if (saysRecordNotFound) return { status: 'empty', sourceWarnings };
    return {
      status: 'failed',
      refusal: 'parse_empty_unconfirmed',
      sourceWarnings,
      error:
        'a results table was read and produced no rows that identify a case, and the source did ' +
        'not print "Record not found". Zero rows we could read is not zero cases.',
    };
  }

  return { status: 'ok', items, sourceWarnings };
}
