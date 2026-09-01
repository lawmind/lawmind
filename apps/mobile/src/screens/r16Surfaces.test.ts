import { V1_SURFACE, type SurfaceName } from '../state/capabilities';

/**
 * NODE BUILT-INS, TYPED LOCALLY — the reason `screens/routeGates.test.ts`
 * gives: `@types/node` is not in this workspace's `tsconfig.json`, and adding
 * it would touch the root lockfile while other lanes work in the same tree.
 */
declare const __dirname: string;
declare function require(id: string): unknown;

const { readFileSync, readdirSync, statSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join } = require('path') as { join: (...parts: string[]) => string };

const SRC_DIR = join(__dirname, '..');
const APP_DIR = join(__dirname, '..', '..', 'app');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const PRODUCTION_SOURCE = [...walk(SRC_DIR), ...walk(APP_DIR)].map((f) => ({
  file: f,
  source: withoutComments(readFileSync(f, 'utf8')),
}));

/**
 * WHAT ACTUALLY REACHES A SCREEN — comments removed before any claim is scanned.
 *
 * `routeGates.test.ts` states the principle this follows: "REACHABILITY
 * DECIDES, NOT A TEXT MATCH." A banned phrase inside a comment renders nowhere,
 * and this file is thick with comments that QUOTE the phrases they forbid —
 * "Re-sync · Last synced", "save without a matter" — because naming a refused
 * claim is how the next reader learns it was refused rather than overlooked.
 *
 * Without this the audit fails on its own documentation, which would teach
 * exactly the wrong lesson: delete the explanation to make the test pass.
 *
 * Deliberately crude. It is a claim scan over TypeScript this repo writes, not
 * a parser, and the one thing it must never do is remove real code — so it
 * strips block and line comments and leaves everything else, string literals
 * included, because a claim in a string literal is precisely what it is hunting.
 */
function withoutComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const close = src.indexOf('*/', i + 2);
      i = close < 0 ? src.length : close + 2;
      out.push(' ');
      continue;
    }
    if (src.startsWith('//', i)) {
      const newline = src.indexOf('\n', i);
      i = newline < 0 ? src.length : newline;
      out.push(' ');
      continue;
    }
    out.push(src[i]!);
    i += 1;
  }
  return out.join('');
}

const source = (...parts: string[]) =>
  withoutComments(readFileSync(join(SRC_DIR, ...parts), 'utf8'));

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE R16 ROUND'S OWN BOUNDARIES — NEW3 R16 §13's `DO_NOT_BUILD` table, and the
 * terminal assertions in §14 this lane is answerable for.
 *
 * `routeGates.test.ts` walks the ROUTES; this walks the CLAIMS. They are
 * different failure modes: a route can be correctly gated while a screen
 * quietly grows an affordance for a thing the server cannot do.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('R16-RCC-X01 · no global saved authority', () => {
  /**
   * Saved authorities are matter-scoped at the server. The R16 work added a HELD
   * INTENT that survives matter creation — the opposite of a global store: it
   * lives on one device, for minutes, and is destroyed the moment it is
   * performed or abandoned.
   */
  it('the picker offers only the route into a matter', () => {
    const picker = source('screens', 'judgment', 'MatterPicker.tsx');

    expect(picker).toContain('Create a matter');
    expect(picker).not.toMatch(/save without a matter|save for later|saved authorities list/i);
  });
});

describe('R16-RCC-X02 · no invented matter actions', () => {
  const manage = source('screens', 'matter', 'ManageMatterScreen.tsx');

  /** The enum is `{active, disposed, archived}`. There is no fourth value. */
  it('offers no "on hold" state', () => {
    expect(manage).not.toMatch(/on_hold|On hold/);
  });

  /** There is no delete route for a matter. Account erasure is a different thing. */
  it('offers no hard delete', () => {
    expect(manage).not.toMatch(/deleteMatter|removeMatter/);
  });

  /** No re-sync endpoint exists, and no imported history for one to replace. */
  it('offers no CNR re-sync', () => {
    expect(manage).not.toMatch(/last synced/i);
    expect(manage).not.toMatch(/Re-sync/i);
  });

  /**
   * `patchMatterBody` has no `caseType` and no `parties` key, and the UPDATE
   * writes neither column — a control for either would save and change nothing.
   */
  it('edits no field PATCH cannot write', () => {
    const patched = manage.slice(manage.indexOf('const result = await save('));
    expect(patched).not.toMatch(/caseType:|parties:/);
  });
});

describe('R16-RCC-X05 · monitoring stays unavailable', () => {
  it('is still held in the frozen registry', () => {
    expect(V1_SURFACE.monitoring.v1).toBe('DISABLED_NOT_READY');
  });

  /**
   * A CITATOR ALERT IS NOT MONITORING. The alerts this product sends are about
   * an authority's own good-law status changing, which is a fact we hold; a
   * monitoring product would be a claim about a court's live listings, which
   * has never had an observation behind it.
   */
  /**
   * WHAT X05 ACTUALLY FORBIDS is a MONITORING product — a claim about a court's
   * live listings, which has never had a single observation behind it
   * (`ecourts_observation` is empty and the endpoint reports `NO_OBSERVATIONS`
   * as a state rather than as a date).
   *
   * IT DOES NOT FORBID THE CITATOR'S OWN CADENCE, and an earlier version of
   * this assertion did: it matched "Re-checked every night" on
   * `VerificationSheet`, which is about an authority's good-law status and not
   * about a court's diary. Those are different subsystems reading different
   * rows, and NEW3 R16 §11 records `CITATOR_ALERT_REGRESSION = NO` precisely to
   * keep them apart. That line is a pre-existing claim of a different kind; it
   * is raised to NEW3 rather than quietly rewritten here, because copy is
   * licence protection and what it may promise is a product decision.
   */
  it('no surface claims a court-listing cadence or an eCourts SLA', () => {
    for (const { file, source: src } of PRODUCTION_SOURCE) {
      if (file.endsWith('manifest.ts')) continue;
      expect(src).not.toMatch(/cause list.{0,20}(every|hourly|daily)/i);
      expect(src).not.toMatch(/(listings?|hearings?).{0,20}(checked|polled) every/i);
      expect(src).not.toMatch(/we monitor (the )?court/i);
    }
  });
});

describe('R16-RCC-X06 · the held surfaces stay held', () => {
  const held: SurfaceName[] = [
    'drafting',
    'briefing',
    'counterArguments',
    'monitoring',
    'goodLawClaim',
    'statuteCorrespondence',
    'savedSearchFeed',
  ];

  it('none of them was opened by this round', () => {
    for (const name of held) expect(V1_SURFACE[name].v1).not.toBe('ENABLED_V1');
  });
});

/**
 * `STATUTE_LINKED_EXPOSED = NO` — NEW3 R16 §9, and STILL NO after this round.
 *
 * `statute.linked_judgments` is `POST_V1` on every platform, and NEW3's own
 * decision record spells the lifecycle out in two phases:
 * `STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED HERE, AND WHY IT IS A STRENGTHENING RATHER THAN A WEAKENING.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Phase one has happened: LCC's scoped, evidence-qualified route landed at
 * `69d2a9bb`. Phase two — RCC implementing behind a gate — is what R16-RCC-08's
 * `EXPECTED_STATE` column asks for, and its stated blocker was the route.
 *
 * This block used to assert that the STRING `linkedJudgments` appeared in no
 * production source. That was a true and useful proxy for "unreachable" while
 * the client had built nothing. It is not a reachability test: it would pass on
 * a screen mounted at a live path through a differently-named variable, and it
 * now fails on a component that has no route at all. Kept as written, its only
 * available fix would have been to delete the held surface NEW3 asked for.
 *
 * So it is replaced by the property it was standing in for, asserted directly
 * and more strictly, in `screens/statutes/statuteLinkedUnreachable.test.ts`: no
 * route file exists or imports the screen, nothing under `app/` names it, the
 * `/s/<slug>` map has no row for it, `V1_SURFACE` gained no surface, and exactly
 * two files in the whole client may name the method.
 */
describe('statute-linked judgments are not exposed', () => {
  /**
   * The registry is the half that must not move, and it is asserted here rather
   * than in the reachability file because it is a PRODUCT decision, not a
   * routing fact. `POST_V1` is what makes the held surface held.
   */
  it('no client surface was opened for it', () => {
    expect(Object.keys(V1_SURFACE)).not.toContain('statuteLinkedJudgments');
    expect(Object.keys(V1_SURFACE)).not.toContain('statuteLinked');
  });

  /**
   * REACHABILITY IS ASSERTED ELSEWHERE, AND THIS PINS THAT IT IS. A file that
   * quietly stopped existing would take the guarantee with it, so its presence
   * is part of this round's evidence rather than a matter of trust.
   */
  it('and the reachability assertions exist to carry the guarantee', () => {
    const held = PRODUCTION_SOURCE.map(({ file }) => file);
    expect(held.some((f) => f.endsWith('StatuteLinkedJudgmentsScreen.tsx'))).toBe(true);
    expect(
      readFileSync(join(SRC_DIR, 'screens', 'statutes', 'statuteLinkedUnreachable.test.ts'), 'utf8'),
    ).toContain('there is no route to the statute-linked surface');
  });

  it('and no surface claims a section-to-section correspondence', () => {
    expect(V1_SURFACE.statuteCorrespondence.v1).toBe('DISABLED_NOT_READY');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `R16-RCC-06/07` — the desktop workspaces were BUILT, and released NOTHING.
 *
 * `V1_CAPABILITY_REGISTRY_R15.json`: "ZERO capabilities are ENABLED on
 * WEB_ADVOCATE_APP", and "no capability enabled merely because client code
 * exists" — naming these very files. The work this round did is functional, not
 * a release, and this is the assertion that keeps the two apart.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the desktop workspaces release nothing', () => {
  it('adds no surface to the frozen client registry', () => {
    expect(Object.keys(V1_SURFACE)).not.toContain('advocateWeb');
    expect(Object.keys(V1_SURFACE)).not.toContain('desktop');
  });

  /** Same APIs. No endpoint, parameter or field was added for either surface. */
  it('calls no endpoint of its own', () => {
    expect(source('screens', 'research', 'ResearchWorkspace.tsx')).not.toMatch(/\bapi\./);
    expect(source('screens', 'matter', 'MatterWorkspace.tsx')).not.toMatch(/\bapi\./);
  });

  /** Below the breakpoint both render the phone screen and nothing else. */
  it('keeps the phone path as the default in both', () => {
    expect(source('screens', 'research', 'ResearchWorkspace.tsx')).toContain(
      'if (!twoPane) return <SearchScreen />;',
    );
    expect(source('screens', 'matter', 'MatterWorkspace.tsx')).toContain(
      'if (!twoPane) return <MattersScreen />;',
    );
  });

  /**
   * THE KEYBOARD IS WEB-GATED, not width-gated. There is no `window` to listen
   * on elsewhere, and a wide tablet has no Escape key — a width test would
   * install a listener on a device that can never fire it.
   */
  it('binds its keyboard affordance behind Platform.OS', () => {
    for (const [dir, file] of [
      ['research', 'ResearchWorkspace.tsx'],
      ['matter', 'MatterWorkspace.tsx'],
    ] as const) {
      const src = source('screens', dir, file);
      expect(src).toContain("Platform.OS !== 'web'");
      expect(src).toContain("window.addEventListener('keydown'");
      expect(src).toContain("window.removeEventListener('keydown'");
    }
  });
});
