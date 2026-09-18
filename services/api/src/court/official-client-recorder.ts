/**
 * Execute the licensed client's OWN javascript, offline, with a transport that
 * opens no socket — and record the requests it builds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R12 reconciled our request shape against the licensed client field by field
 * and had to mark most rows `TRANSCRIBED` — read from the client's source at
 * some point, but not held in this repository, so unre-derivable by anyone
 * later. Three of those transcriptions turned out to be WRONG once the bytes
 * arrived (`docs/ai/lcc-r12b/ECOURTS_REQUEST_DIFF_V2.md`), including a pair of
 * anti-automation headers whose name AND value had drifted.
 *
 * A transcription cannot be checked. Running the real code can. So the three
 * retained scripts are executed here, unmodified, inside a sandbox whose `$` and
 * `$.ajax` are shims, and every request they construct is captured verbatim.
 * The test beside this file diffs that capture against what `ecourts.ts` builds,
 * which turns "our request matches the official client" from a claim in a
 * document into an assertion that fails when either side moves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SOCKET, AND THAT IS STRUCTURAL RATHER THAN CAREFUL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The sandbox has no `fetch`, no `XMLHttpRequest` and no `require`. `$.ajax` and
 * `$.getJSON` are recorders. There is no path from this module to the network,
 * so running it can neither spend the grant's quota nor contact the court —
 * which is what makes it safe to run in CI on every commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR SUBSTITUTIONS, NAMED — because an unnamed substitution is a lie
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **The DOM is a map of id -> value**, seeded from the retained module page
 *    and overridden by the caller. Real layout is irrelevant to a request body.
 * 2. **`setTimeout` runs its callback immediately.** `ajaxCall` wraps its send
 *    in a 50 ms timer and `fillCauseList` in a 1,500 ms one. That changes WHEN a
 *    request is built, never WHAT is in it.
 * 3. **Unknown globals resolve to a function returning `true`.** The client's
 *    validators (`validate_state_dist_complex`, `checkDateInpuWithNextMonth`,
 *    `pattern`) live in assets we have not retained. They gate whether a request
 *    is sent; they contribute nothing to its bytes. Returning `true` runs the
 *    path we are trying to observe, and is recorded as an assumption below.
 * 4. **`Date` is pinned** when the caller supplies a `now`, because
 *    `selprevdays` is computed from the difference between today and the
 *    requested date, and a recording that changed at midnight would be useless
 *    as a fixture.
 *
 * Anything the shim was asked for and did not have is reported in
 * `unresolvedSelectors`, so a substitution can never quietly become a fiction.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

/** One request the official client built. Recorded exactly as it was passed. */
export type RecordedRequest = {
  /** The module path the client asked for, e.g. `cause_list/submitCauseList`. */
  path: string;
  /** The URL `$.ajax` was given, built by the client from its own `base_url`. */
  url: string;
  method: string;
  /** The body, verbatim, including whatever `ajaxCall` appended. */
  body: string;
  /** Parsed into ordered pairs, because field ORDER is part of the record. */
  fields: { name: string; value: string }[];
  headers: Record<string, string>;
  dataType: string | undefined;
};

export type RecordingResult = {
  requests: RecordedRequest[];
  /** Selectors the shim was asked for and had no element for. */
  unresolvedSelectors: string[];
  /** Globals that fell through to the permissive default. */
  substitutedGlobals: string[];
};

/**
 * A stand-in that answers to any property, call, or `new`.
 *
 * The unretained assets give the client widgets (`bootstrap.Modal`), alert
 * tables (`alerts_array`) and validators (`validate_state_dist_complex`). None
 * of them contributes to a request body, but the client calls, indexes and
 * constructs them freely, so the stand-in has to survive all three.
 *
 * **It converts to `1`, deliberately.** The obvious choice — the empty string —
 * is a trap: the client writes `if (retValNxtMon == false)`, and `'' == false`
 * is `true` in JavaScript, so an empty-string stand-in would take the
 * "Selection only upto 1 month allowed" branch and return before building the
 * request we are here to record. `1 == false` is false, and `1` is truthy, so
 * every validator reads as "passed".
 */
function permissiveValue(): unknown {
  const target = function permissive(): unknown {
    return proxy;
  };
  const proxy: unknown = new Proxy(target, {
    get(_t, prop): unknown {
      if (prop === Symbol.toPrimitive) return (): number => 1;
      if (prop === 'toString' || prop === 'valueOf') return (): number => 1;
      if (prop === 'length') return 0;
      return proxy;
    },
    apply: (): unknown => proxy,
    construct: (): object => proxy as object,
    has: (): boolean => true,
  });
  return proxy;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '__fixtures__');

/**
 * The retained assets this recorder runs. Named as constants so a missing one is
 * a clear failure rather than an empty recording that looks like a finding.
 */
export const RETAINED_CLIENT_ASSETS = {
  page: 'ecourts-cause-list-module-index-2026-08-29.html',
  components: 'ecourts-components-2026-08-29.js',
  commonHeader: 'ecourts-common-header-2026-08-29.js',
  searchByCauselist: 'ecourts-search-by-causelist-2026-08-29.js',
} as const;

/** Every `<input>` / `<select>` in the retained page, by id. */
export function elementsFromPage(html: string): Map<string, { name?: string; value: string }> {
  const out = new Map<string, { name?: string; value: string }>();
  for (const tag of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const raw = tag[0]!;
    const id = /\bid\s*=\s*['"]([^'"]*)['"]/i.exec(raw)?.[1];
    if (!id) continue;
    const name = /\bname\s*=\s*['"]([^'"]*)['"]/i.exec(raw)?.[1];
    const value = /\bvalue\s*=\s*['"]([^'"]*)['"]/i.exec(raw)?.[1] ?? '';
    out.set(id, name === undefined ? { value } : { name, value });
  }
  return out;
}

/**
 * The ids that `$("#frm_causelist").serialize()` actually covers.
 *
 * **This is the detail every previous reading got wrong, in both directions.**
 * A serialiser submits only *successful controls* — those inside the form AND
 * carrying a `name`. In the retained page the cascading selects
 * (`sess_state_code`, `sess_dist_code`, `court_complex_code`, `court_est_code`)
 * and every hidden field sit BEFORE `<form id="frm_causelist">` and are
 * therefore outside it, so `serialize()` yields exactly three fields. The
 * official client appends the rest by hand, which is why its body looks
 * hand-built — it half is.
 */
export function serializedFormIds(html: string): string[] {
  const start = html.indexOf('<form name="frm_causelist"');
  if (start === -1) return [];
  const end = html.indexOf('</form>', start);
  const inner = html.slice(start, end === -1 ? undefined : end);
  const ids: string[] = [];
  for (const tag of inner.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const raw = tag[0]!;
    if (/\btype\s*=\s*['"](submit|button|reset|image|file)['"]/i.test(raw)) continue;
    const name = /\bname\s*=\s*['"]([^'"]*)['"]/i.exec(raw)?.[1];
    const id = /\bid\s*=\s*['"]([^'"]*)['"]/i.exec(raw)?.[1];
    if (!name) continue; // unnamed controls are not successful and are not sent
    ids.push(id ?? name);
  }
  return ids;
}

export type RecordOptions = {
  /**
   * Element values, by id — the choices a person would have made in the form.
   * Overrides whatever the retained page delivered.
   */
  values: Record<string, string>;
  /** Visible text of the selected option, by select id. For `court_name_txt`. */
  selectedText?: Record<string, string>;
  /** Pin the clock. `selprevdays` is derived from it. */
  now?: Date;
  /** Which client entry points to invoke, in order. */
  invoke: (
    | { fn: 'fillDistrict'; stateCode: string }
    | { fn: 'fillCourtComplex'; distCode: string }
    | { fn: 'fillEst' }
    | { fn: 'fillCauseList' }
    | { fn: 'submit_causelist'; cicri: string }
  )[];
};

export function recordOfficialRequests(options: RecordOptions): RecordingResult {
  const page = readFileSync(join(FIXTURES, RETAINED_CLIENT_ASSETS.page), 'utf8');
  const elements = elementsFromPage(page);
  const serialisedIds = serializedFormIds(page);

  const values = new Map<string, string>();
  for (const [id, el] of elements) values.set(id, el.value);
  for (const [id, v] of Object.entries(options.values)) values.set(id, v);

  const requests: RecordedRequest[] = [];
  const unresolved = new Set<string>();
  const substituted = new Set<string>();

  /** A jQuery set of at most one known element. */
  function node(selector: string): Record<string, unknown> {
    const sel = selector.trim();
    const idMatch = /^#([A-Za-z0-9_-]+)/.exec(sel);
    const id = idMatch?.[1];
    const known = id !== undefined && values.has(id);
    if (!known && id !== undefined) unresolved.add(sel);

    const optionSelected = /option:selected/.test(sel);

    const self: Record<string, unknown> = {
      val: (...args: unknown[]): unknown => {
        if (args.length > 0) {
          if (id !== undefined) values.set(id, String(args[0] ?? ''));
          return self;
        }
        // A jQuery set with no elements answers `undefined`, NOT ''. The client
        // relies on that: `$('#fcaptcha_code').val()==''` is false on this page
        // because the element does not exist, so the submit proceeds.
        return known ? values.get(id!) : undefined;
      },
      text: (): string =>
        optionSelected && id !== undefined ? (options.selectedText?.[id] ?? '') : '',
      html: (...args: unknown[]): unknown => (args.length > 0 ? self : ''),
      serialize: (): string =>
        serialisedIds
          .map((fid) => {
            const name = elements.get(fid)?.name ?? fid;
            return `${encodeURIComponent(name)}=${encodeURIComponent(values.get(fid) ?? '')}`;
          })
          .join('&'),
      attr: (): unknown => undefined,
      prop: (): unknown => self,
      rules: (): unknown => self,
      validate: (): unknown => self,
      valid: (): boolean => true,
      is: (): boolean => false,
      hasClass: (): boolean => false,
      addClass: (): unknown => self,
      removeClass: (): unknown => self,
      removeAttr: (): unknown => self,
      hide: (): unknown => self,
      show: (): unknown => self,
      focus: (): unknown => self,
      blur: (): unknown => self,
      first: (): unknown => self,
      on: (): unknown => self,
      each: (): unknown => self,
      // `$(document).ready(fn)` — run it; it only wires handlers.
      ready: (fn: unknown): unknown => {
        if (typeof fn === 'function') (fn as () => void)();
        return self;
      },
    };
    /**
     * Anything else jQuery offers (`.datepicker`, `.chosen`, `.trigger`, …)
     * becomes a chainable no-op. The client calls plenty of plugin methods that
     * decorate widgets; none of them contributes to a request body, and listing
     * them one by one would mean this recorder broke every time the court added
     * a plugin.
     */
    const proxied: Record<string, unknown> = new Proxy(self, {
      get(target, prop: string | symbol): unknown {
        if (prop in target) return Reflect.get(target, prop);
        if (typeof prop === 'symbol') return undefined;
        // Chainable: jQuery plugin calls are written as `.datepicker(…).next(…)`.
        return (): unknown => proxied;
      },
    });
    return proxied;
  }

  const jquery = ((selector: unknown): unknown => {
    if (typeof selector === 'function') {
      // `$(document).ready(fn)` and `$(fn)` — run it, it only wires handlers.
      (selector as () => void)();
      return node('');
    }
    return node(String(selector));
  }) as unknown as Record<string, unknown> & ((s: unknown) => unknown);

  function record(
    path: string,
    url: string,
    body: string,
    headers: Record<string, string>,
    method: string,
    dataType: string | undefined,
  ): void {
    requests.push({
      path,
      url,
      method,
      body,
      fields: body
        .split('&')
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf('=');
          return eq === -1
            ? { name: pair, value: '' }
            : { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
        }),
      headers,
      dataType,
    });
  }

  jquery['ajax'] = (opts: Record<string, unknown>): unknown => {
    const url = String(opts['url'] ?? '');
    record(
      url.replace(/^.*\/\?p=/, ''),
      url,
      String(opts['data'] ?? ''),
      (opts['headers'] as Record<string, string>) ?? {},
      String(opts['type'] ?? 'GET'),
      opts['dataType'] === undefined ? undefined : String(opts['dataType']),
    );
    /**
     * The reply the client is handed. Deliberately minimal: `status: 1` and a
     * MARKED token keep the client on its success path without inventing
     * response CONTENT, which this recorder has no business asserting about.
     *
     * The token is marked rather than empty so that rotation is VISIBLE in the
     * recording: every request after the first carries `ROTATED_BY_REPLY`, which
     * is the proof that the client re-reads `app_token` from each reply and
     * carries it forward — the property `ecourts.ts` implements on its session.
     */
    const success = opts['success'];
    if (typeof success === 'function') {
      (success as (r: unknown) => void)({
        status: 1,
        app_token: 'ROTATED_BY_REPLY',
        errormsg: '',
        msg: '',
      });
    }
    return { done: (): unknown => undefined, fail: (): unknown => undefined };
  };
  jquery['getJSON'] = (url: unknown, data: unknown): unknown => {
    record(
      String(url).replace(/^.*\/\?p=/, ''),
      String(url),
      String(data ?? ''),
      {},
      'GET',
      'json',
    );
    return { done: (): unknown => undefined, fail: (): unknown => undefined };
  };
  jquery['each'] = (): unknown => undefined;
  jquery['extend'] = (): unknown => undefined;

  /**
   * `$.ajaxSetup`, `$.fn`, `$.validator` and friends — no-ops. Only `$.ajax` and
   * `$.getJSON` build requests, and those are recorded above.
   */
  const $ = new Proxy(jquery, {
    get(target, prop: string | symbol): unknown {
      if (prop in target) return Reflect.get(target, prop);
      if (typeof prop === 'symbol') return undefined;
      const noop = (): unknown => undefined;
      return new Proxy(noop, { get: () => noop });
    },
  });

  const PinnedDate = options.now
    ? new Proxy(Date, {
        construct(target, args): object {
          return args.length === 0
            ? new target(options.now!.getTime())
            : new target(...(args as ConstructorParameters<typeof Date>));
        },
      })
    : Date;

  const base: Record<string, unknown> = {
    $,
    jQuery: $,
    Date: PinnedDate,
    Math,
    JSON,
    parseInt,
    parseFloat,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    console: {
      log: (): void => {},
      error: (): void => {},
      warn: (): void => {},
      clear: (): void => {},
      info: (): void => {},
    },
    // Runs immediately. Timing is not part of a request body.
    setTimeout: (fn: () => void): number => {
      fn();
      return 0;
    },
    setInterval: (): number => 0,
    clearTimeout: (): void => {},
    alert: (): void => {},
    confirm: (): boolean => false,
    document: {
      title: '',
      getElementById: (id: string): Record<string, unknown> => {
        if (!values.has(id)) unresolved.add(`#${id}`);
        return { value: values.get(id) ?? '', src: '', blur: (): void => {} };
      },
      addEventListener: (): void => {},
    },
    location: { href: '', replace: (): void => {} },
    navigator: { userAgent: 'offline-recorder' },
  };
  base['history'] = { forward: (): void => {}, back: (): void => {}, pushState: (): void => {} };
  base['screen'] = { width: 1280, height: 800 };

  /**
   * Unknown globals become a function that returns `true`.
   *
   * The client's validators live in assets we have not retained. They decide
   * WHETHER to send, never WHAT to send, so answering `true` runs the path we
   * are here to observe. Every name that lands here is reported.
   */
  const sandbox = new Proxy(base, {
    has: (): boolean => true,
    get(target, prop: string | symbol): unknown {
      if (typeof prop === 'string' && !(prop in target)) {
        substituted.add(prop);
        return permissiveValue();
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value): boolean {
      return Reflect.set(target, prop, value);
    },
  });

  /**
   * `window` must be the PROXY, not the bare object — the client reads
   * `window.history.forward()` and other names the permissive fallback supplies.
   * Assigned after construction because the proxy cannot reference itself.
   */
  base['window'] = sandbox;
  base['globalThis'] = sandbox;
  base['self'] = sandbox;

  const context = createContext(sandbox);
  for (const asset of [
    RETAINED_CLIENT_ASSETS.components,
    RETAINED_CLIENT_ASSETS.commonHeader,
    RETAINED_CLIENT_ASSETS.searchByCauselist,
  ]) {
    runInContext(readFileSync(join(FIXTURES, asset), 'utf8'), context, { filename: asset });
  }

  for (const step of options.invoke) {
    switch (step.fn) {
      case 'fillDistrict':
        runInContext(`fillDistrict(${JSON.stringify(step.stateCode)})`, context);
        break;
      case 'fillCourtComplex':
        runInContext(`fillCourtComplex(${JSON.stringify(step.distCode)})`, context);
        break;
      case 'fillEst':
        runInContext('fillEst()', context);
        break;
      case 'fillCauseList':
        runInContext('fillCauseList()', context);
        break;
      case 'submit_causelist':
        runInContext(`submit_causelist(${JSON.stringify(step.cicri)})`, context);
        break;
    }
  }

  return {
    requests,
    unresolvedSelectors: [...unresolved].sort(),
    substitutedGlobals: [...substituted].sort(),
  };
}
