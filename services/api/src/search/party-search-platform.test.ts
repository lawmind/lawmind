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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SWITCH IS NOW FLIPPED ON iOS, AND THIS FILE RECORDS THAT DECISION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Until 2 Sep 2026 the overrides map was empty and the switch was exercised
 * against a SYNTHETIC override. NEW3 has since decided it:
 * `IOS_PARTY_SEARCH_DECISION = ACTIVATE_IOS_OFF_NOW` (bus 1707; V7.2 §10.5 makes
 * OFF the submission default absent a recorded ON decision). So the live row
 * exists, and the assertions that pinned "unflipped on every platform" were
 * updated DELIBERATELY, in the change that added the row, to assert the new
 * decision — they recorded a product decision, not a safety property.
 *
 * A fourth claim joins them, and it is the one the old guard existed for:
 *
 *   4. a suppressed arm is not an honest zero. With party search off, zero
 *      results derive `coverage_unknown` + `capability_disabled`, never
 *      `abstained` + `low_relevance`. "We could not search" and "there is no law
 *      on this" are different sentences and the advocate must be told which one
 *      they are reading.
 *
 * Both paths are exercised: the injected `partyNameArmPermitted` (which pins the
 * serialisation regardless of what the registry says) and the REAL production
 * wiring reached through the `x-lawmind-platform` header, which is what actually
 * changed today.
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
import { partyNameArmPermitted } from '../release/enforce.ts';
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

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE SWITCH IS FLIPPED ON iOS — UPDATED DELIBERATELY, 2 SEP 2026
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This assertion previously read "the switch ships unflipped on every
   * platform". That recorded a PRODUCT DECISION, not a safety property, and
   * NEW3 has since taken the decision the other way:
   * `IOS_PARTY_SEARCH_DECISION = ACTIVATE_IOS_OFF_NOW` (bus 1707, V7.2 §10.5,
   * `IOS_PARTY_SEARCH_SUBMISSION_DEFAULT = OFF` absent a recorded ON decision).
   *
   * So it is correct that the old assertion broke, and it is rewritten here to
   * assert the NEW decision rather than deleted, weakened, or repaired
   * incidentally into something that would pass under either state. What it
   * must still pin is the blast radius: exactly one platform, exactly one
   * capability, and the release-wide state untouched.
   */
  it('is DISABLED on ios and untouched everywhere else — the flip, and its blast radius', () => {
    assert.equal(
      isUserReachableOnPlatform('search.party_name', 'ios'),
      false,
      'iOS party search is OFF: V7.2 §10.5 default, NEW3 bus 1707',
    );

    for (const p of ['android', 'web', 'unknown'] as const) {
      assert.equal(
        isUserReachableOnPlatform('search.party_name', p),
        true,
        `${p} must be untouched — the override is platform-keyed and only ios carries a row`,
      );
    }

    assert.equal(
      RELEASE_CAPABILITIES['search.party_name'].state,
      'ENABLED',
      'the RELEASE-WIDE state does not move; one platform narrows its own view of it',
    );

    assert.deepEqual(
      Object.keys(PLATFORM_CAPABILITY_OVERRIDES),
      ['ios'],
      'no platform other than ios may carry an override in this release',
    );
    assert.deepEqual(
      Object.keys(PLATFORM_CAPABILITY_OVERRIDES.ios ?? {}),
      ['search.party_name'],
      'the iOS row narrows party search and NOTHING else — one capability, one platform',
    );
    assert.equal(PLATFORM_CAPABILITY_OVERRIDES.ios?.['search.party_name']?.state, 'DISABLED');
  });

  it('no OTHER capability is narrowed on any platform — every one resolves release-wide', () => {
    for (const name of Object.keys(RELEASE_CAPABILITIES) as (keyof typeof RELEASE_CAPABILITIES)[]) {
      if (name === 'search.party_name') continue;
      for (const p of ['ios', 'android', 'web', 'unknown'] as const) {
        assert.equal(
          capabilityStateForPlatform(name, p),
          RELEASE_CAPABILITIES[name].state,
          `${name} on ${p} must still be the release-wide state`,
        );
      }
    }
  });

  it('the per-platform registry answers for the platform asked, and names what it narrowed', () => {
    const wide = capabilityRegistry();
    const ios = capabilityRegistry('ios');
    assert.equal(
      'platform' in wide,
      false,
      'the release-wide shape is unchanged for callers that send nothing',
    );
    assert.equal(
      (wide as { capabilities: Record<string, { state: string }> }).capabilities[
        'search.party_name'
      ]?.state,
      'ENABLED',
      'a caller that sends no platform still sees the release-wide ENABLED',
    );
    assert.equal((ios as { platform: string }).platform, 'ios');
    assert.deepEqual(
      (ios as { platformOverrides: string[] }).platformOverrides,
      ['search.party_name'],
      'the narrowing is NAMED in the registry, so a store listing is checkable against it',
    );
    assert.equal(
      (ios as { capabilities: Record<string, { state: string }> }).capabilities[
        'search.party_name'
      ]?.state,
      'DISABLED',
    );

    for (const p of ['android', 'web'] as const) {
      assert.deepEqual(
        (capabilityRegistry(p) as { platformOverrides: string[] }).platformOverrides,
        [],
        `${p} narrows nothing`,
      );
    }
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
 * THE LIVE ROW, THROUGH THE REAL WIRING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The suite above injects `partyNameArmPermitted`, which pins the serialisation
 * no matter what the registry holds — necessary, and not a test of today's
 * change. These call `/search` with no injection at all, so the arm decision
 * comes from `release/enforce.ts` -> `isUserReachableOnPlatform` ->
 * `PLATFORM_CAPABILITY_OVERRIDES`. Delete the iOS row and these fail.
 */
describe('POST /search with the LIVE ios override', () => {
  const emptySql = ((strings: TemplateStringsArray) => {
    const source = strings.join(' ');
    return Promise.resolve(source.includes('count(*)') ? [{ n: 0 }] : []);
  }) as unknown as Sql;

  const search = async (platform: string) => {
    const app = createApp({
      ping: async () => {},
      search: { sql: emptySql, embedQuery: async () => null },
    });
    const response = await app.request('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lawmind-platform': platform },
      body: JSON.stringify({ query: 'SATENDER KUMAR ANTIL', language: 'en' }),
    });
    assert.equal(response.status, 200);
    return (await response.json()) as {
      data: {
        degraded: string[];
        retrievalOutcome: { state: string; reasons: string[] };
      };
    };
  };

  it('iOS: the party arm is suppressed and the response says so', async () => {
    const body = await search('ios');
    assert.ok(
      body.data.degraded.includes('party_name_disabled'),
      'the degradation must be VISIBLE — a capability that silently vanishes is the failure §9.5 names',
    );
  });

  /**
   * The whole of CCR-NEW3-S2F-01. A suppressed party query returning zero used
   * to derive `abstained` + `low_relevance` — byte-identical to an honest zero,
   * so "we could not search" rendered as "there is no law on this". That is the
   * one outcome this flip may never produce.
   */
  it('iOS: a suppressed zero is coverage_unknown/capability_disabled, NEVER an honest zero', async () => {
    const { retrievalOutcome } = (await search('ios')).data;
    assert.equal(retrievalOutcome.state, 'coverage_unknown');
    assert.ok(retrievalOutcome.reasons.includes('capability_disabled'));
    assert.notEqual(
      retrievalOutcome.state,
      'abstained',
      'a suppressed arm must never read as "we looked and there is nothing"',
    );
    assert.equal(
      retrievalOutcome.reasons.includes('low_relevance'),
      false,
      'low_relevance is the honest-zero reason and must not be borrowed by a disabled capability',
    );
  });

  /**
   * Android and web are asserted at the DECISION rather than over HTTP, and the
   * reason is that they are not suppressed: `/search` on those platforms runs
   * the real party arm, which needs a real database, and the stub above is a
   * two-branch fake. `partyNameArmPermitted` is not a proxy for the production
   * wiring — `search/route.ts:653` calls exactly this function with exactly
   * `platformFromRequest(c)`, which the iOS cases above have just driven end to
   * end through the header.
   */
  it('android, web and unknown are NOT suppressed — the row reaches one platform only', () => {
    assert.equal(partyNameArmPermitted('ios'), false, 'ios is the platform that was narrowed');
    for (const platform of ['android', 'web', 'unknown'] as const) {
      assert.equal(
        partyNameArmPermitted(platform),
        true,
        `${platform} must still run the party arm — the override is keyed on ios alone`,
      );
    }
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
