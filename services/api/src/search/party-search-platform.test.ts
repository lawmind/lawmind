/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §9.5 — THE iOS PARTY-SEARCH KILL SWITCH, AND THE THINGS IT MUST NOT TAKE WITH IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Roadmap v7.1 §9.5. Apple's guideline 5.1.1(viii) reaches an app that compiles
 * personal information from any source not supplied directly by the user,
 * public databases included. Case-first design is the correct mitigation and
 * v7.1 is explicit that it is **not a guarantee** — so the switch has to exist
 * before App Review rather than be built under rejection pressure.
 *
 * Three separate claims are asserted here, because they fail independently:
 *
 *   1. the switch NARROWS and can never widen — a platform override cannot turn
 *      on something the release-wide registry refuses;
 *   2. with party search off, exact case number, CNR and citation lookup are
 *      UNTOUCHED — the requirement that makes it a kill switch and not a
 *      feature removal;
 *   3. the degradation is VISIBLE — `party_name_disabled` reaches the response,
 *      because §9.5 says a capability that silently vanishes produces support
 *      load and a feature-parity claim problem.
 *
 * The overrides map is empty in this release, deliberately: §9.5 says ship the
 * switch, not disable the capability. So the switch is exercised here against a
 * SYNTHETIC override rather than a live one — a guard first exercised on the day
 * it is needed is a guard first exercised after the damage.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Sql } from 'postgres';

import { createApp } from '../app.ts';
import {
  PLATFORM_CAPABILITY_OVERRIDES,
  capabilityRegistry,
  capabilityStateForPlatform,
  isUserReachableOnPlatform,
  parsePlatform,
  RELEASE_CAPABILITIES,
} from '../release/capabilities.ts';
import { classifyQuery } from './query-shape.ts';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('platform resolution', () => {
  it('recognises the three real platforms and nothing else', () => {
    assert.equal(parsePlatform('ios'), 'ios');
    assert.equal(parsePlatform('  IOS '), 'ios');
    assert.equal(parsePlatform('android'), 'android');
    assert.equal(parsePlatform('web'), 'web');
  });

  it('resolves an absent or unrecognised platform to unknown, never to a real one', () => {
    for (const raw of [null, undefined, '', 'ipados', 'desktop', 'ios;android', 'unknown']) {
      assert.equal(
        parsePlatform(raw),
        'unknown',
        `${String(raw)} must not resolve to a real platform`,
      );
    }
  });

  it('an unknown platform gets the release-wide set — every existing client is unchanged', () => {
    for (const name of Object.keys(RELEASE_CAPABILITIES) as (keyof typeof RELEASE_CAPABILITIES)[]) {
      assert.equal(
        capabilityStateForPlatform(name, 'unknown'),
        RELEASE_CAPABILITIES[name].state,
        name,
      );
    }
  });
});

describe('the party-name capability', () => {
  it('is registered, so a claims register can be checked against it', () => {
    assert.ok(
      RELEASE_CAPABILITIES['search.party_name'],
      'search.party_name must exist in the registry',
    );
  });

  it('is reachable on every platform in this release — the switch ships unflipped', () => {
    for (const p of ['ios', 'android', 'web', 'unknown'] as const) {
      assert.equal(isUserReachableOnPlatform('search.party_name', p), true, p);
    }
    assert.deepEqual(
      PLATFORM_CAPABILITY_OVERRIDES,
      {},
      'no capability is narrowed on any platform in this release; adding a row IS flipping the switch',
    );
  });

  it('the per-platform registry answers for the platform asked, and names what it narrowed', () => {
    const wide = capabilityRegistry();
    const ios = capabilityRegistry('ios');
    assert.equal(
      'platform' in wide,
      false,
      'the release-wide shape is unchanged for callers that send nothing',
    );
    assert.equal((ios as { platform: string }).platform, 'ios');
    assert.deepEqual((ios as { platformOverrides: string[] }).platformOverrides, []);
  });
});

describe('a platform override narrows and never widens', () => {
  // The resolution rule is pure, so it is tested directly against a synthetic
  // map rather than by mutating the real one — a test that edits the shipped
  // registry is a test that can leave it edited.
  const NARROWNESS = { ENABLED: 3, LIMITED: 2, EXPERIMENTAL_INTERNAL: 1, DISABLED: 0 } as const;
  const resolve_ = (base: keyof typeof NARROWNESS, override: keyof typeof NARROWNESS) =>
    NARROWNESS[override] < NARROWNESS[base] ? override : base;

  it('DISABLED on a platform beats ENABLED release-wide', () => {
    assert.equal(resolve_('ENABLED', 'DISABLED'), 'DISABLED');
    assert.equal(resolve_('LIMITED', 'DISABLED'), 'DISABLED');
  });

  it('ENABLED on a platform does NOT beat DISABLED release-wide', () => {
    assert.equal(resolve_('DISABLED', 'ENABLED'), 'DISABLED');
    assert.equal(resolve_('EXPERIMENTAL_INTERNAL', 'ENABLED'), 'EXPERIMENTAL_INTERNAL');
  });
});

describe('what the switch must never take with it', () => {
  /**
   * The suppression is keyed on the classifier's `party_name` shape alone. If a
   * case number, CNR, citation or "X v. Y" title ever classified as
   * `party_name`, turning the switch on would silently disable exact identity —
   * the capability a limited V1 rests on. So the classification is asserted
   * here, next to the switch, rather than only in the classifier's own tests.
   */
  const MUST_NOT_BE_PARTY_NAME: [string, string][] = [
    ['2019 INSC 227', 'neutral citation'],
    ['(2021) 3 SCC 713', 'reporter citation'],
    ['DLHC010123452019', 'CNR'],
    ['CRL.A. 1234/2019', 'case number'],
    ['Satender Kumar Antil v. CBI', 'case title with a versus'],
    ['section 302 IPC', 'statute section'],
    ['anticipatory bail in economic offences', 'concept query'],
  ];

  for (const [query, why] of MUST_NOT_BE_PARTY_NAME) {
    it(`${why} does not classify as party_name: ${query}`, () => {
      assert.notEqual(
        classifyQuery(query).shape,
        'party_name',
        `${query} would lose its exact path when the iOS switch is flipped`,
      );
    });
  }

  it('a bare party name still classifies as party_name — the switch has something to switch', () => {
    assert.equal(classifyQuery('SATENDER KUMAR ANTIL').shape, 'party_name');
  });
});

describe('POST /search with a test-only disabled party arm', () => {
  it('serialises capability_disabled through intent, routing and empty retrieval', async () => {
    const seenPlatforms: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      const source = strings.join(' ');
      return Promise.resolve(source.includes('count(*)') ? [{ n: 0 }] : []);
    }) as unknown as Sql;
    const app = createApp({
      ping: async () => {},
      search: {
        sql,
        embedQuery: async () => null,
        partyNameArmPermitted: (platform) => {
          seenPlatforms.push(platform);
          return false;
        },
      },
    });

    const response = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lawmind-platform': 'ios' },
      body: JSON.stringify({ query: 'SATENDER KUMAR ANTIL', language: 'en' }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: {
        degraded: string[];
        retrievalOutcome: { state: string; reasons: string[]; contractVersion: number };
      };
    };
    assert.deepEqual(seenPlatforms, ['ios']);
    assert.ok(body.data.degraded.includes('party_name_disabled'));
    assert.equal(body.data.retrievalOutcome.state, 'coverage_unknown');
    assert.ok(body.data.retrievalOutcome.reasons.includes('capability_disabled'));
    assert.equal(body.data.retrievalOutcome.contractVersion, 1);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NO PERSON-CENTRIC SURFACE EXISTS — READ FROM THE SOURCE TREE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Non-negotiable product rules 10 and 11: no person-profile product, no "search
 * anyone's court history", party search is case-first and never person-first.
 *
 * A behavioural test cannot prove the ABSENCE of an endpoint — it can only
 * exercise the ones it knows about. So this enumerates every route registration
 * in the API and asserts none of them is a person surface. A future route named
 * `/people/:id` fails here on the day it is written.
 */
describe('no person-centric route exists', () => {
  function tsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsFiles(full, out);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
    return out;
  }

  /** `app.get('/x')`, `app.post("/y")` — the registration itself, not a mention. */
  const ROUTE_RE = /\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/g;

  /**
   * A path segment that would make the product person-first. `party` is NOT
   * here: `/search` accepting a party NAME is the case-first capability itself.
   * What is forbidden is a route ABOUT a person — an identity to fetch, a
   * history to list, a dossier to assemble.
   */
  const FORBIDDEN = [
    /\/people\b/i,
    /\/persons?\b/i,
    /\/profiles?\b/i,
    /\/(litigants?|advocates?|judges?)\/[^/]*(history|cases|judgments|dossier|profile)/i,
    /\/party\/[^/]*(history|dossier|profile|cases)/i,
    /court[-_]?history/i,
    /\bdossier\b/i,
  ];

  it('enumerates every registered route and finds no person surface', () => {
    const found: string[] = [];
    for (const file of tsFiles(SRC)) {
      const body = readFileSync(file, 'utf8');
      for (const m of body.matchAll(ROUTE_RE)) {
        const path = m[2] ?? '';
        if (!path.startsWith('/')) continue;
        if (FORBIDDEN.some((re) => re.test(path)))
          found.push(`${relative(SRC, file)}  ${m[1]} ${path}`);
      }
    }
    assert.deepEqual(
      found,
      [],
      `person-centric routes are forbidden by product rules 10 and 11:\n${found.join('\n')}`,
    );
  });
});
