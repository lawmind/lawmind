/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `STATUTE_LINKED_PUBLICLY_REACHABLE = NO` — asserted, not asserted about.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R16 `R16-RCC-08`, whose decision record reads
 * `STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE`
 * and `STATUTE_LINKED_REGISTRY_STATE = POST_V1_ON_IOS_ANDROID_WEB_UNCHANGED`.
 * LCC's route landed at `69d2a9bb`; this is the client half, and this file is
 * what keeps it held.
 *
 * WHY THIS REPLACED THE R17 ASSERTION, AND WHY THAT IS A STRENGTHENING.
 *
 * `screens/r16Surfaces.test.ts` previously asserted that the string
 * `linkedJudgments` appeared in no production source. That was a true and
 * useful proxy for "unreachable" while the client had built nothing — it was
 * phase one of a two-phase lifecycle NEW3 itself specified. Once the component
 * exists so NEW3 can acceptance-test it, the text ban stops measuring
 * reachability and starts measuring only whether the code was written.
 *
 * So the proxy is replaced by the property it was standing in for, and the
 * property is the STRONGER of the two: not "nobody typed the name", but "no
 * route file exists, nothing under `app/` imports the screen, no navigation
 * entry names it, and the request path is the only thing that touches the
 * route". A text ban would pass on a screen mounted at `/statute-linked`
 * through a variable name; this cannot.
 *
 * `routeGates.test.ts` walks the ROUTES and checks each held one is wrapped in
 * a `CapabilityBoundary`. It cannot help here, and that is deliberate: there is
 * no door to gate. A boundary needs a route, and a route is a destination.
 */

declare const __dirname: string;
declare function require(id: string): unknown;

const { readFileSync, readdirSync, statSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join, relative, sep } = require('path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
};

const SRC_DIR = join(__dirname, '..', '..');
const APP_DIR = join(__dirname, '..', '..', '..', 'app');

function walk(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(entry)) out.push(full);
  }
  return out;
}

const ROUTE_FILES = walk(APP_DIR, (n) => n.endsWith('.tsx')).map((f) => ({
  route: relative(APP_DIR, f).split(sep).join('/'),
  source: readFileSync(f, 'utf8'),
}));

const PRODUCTION_SOURCE = walk(
  SRC_DIR,
  (n) => (n.endsWith('.ts') || n.endsWith('.tsx')) && !/\.test\.tsx?$/.test(n),
).map((f) => ({
  file: relative(SRC_DIR, f).split(sep).join('/'),
  source: readFileSync(f, 'utf8'),
}));

/** The two files that ARE the held surface. Everything else must be silent. */
const HELD_SURFACE_FILES = [
  'screens/statutes/StatuteLinkedJudgmentsScreen.tsx',
  'screens/statutes/statuteLinkedTruth.ts',
];

describe('this test still walks the app it claims to walk', () => {
  it('found the route tree and the source tree', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(25);
    expect(PRODUCTION_SOURCE.length).toBeGreaterThan(50);
  });

  it('and the held surface it is about exists', () => {
    for (const file of HELD_SURFACE_FILES) {
      expect(PRODUCTION_SOURCE.map((s) => s.file)).toContain(file);
    }
  });
});

describe('there is no route to the statute-linked surface', () => {
  /**
   * THE LOAD-BEARING ONE. Expo Router mounts a screen because a file exists
   * under `app/`, so a screen no route file imports has no path — and no deep
   * link, because a deep link resolves to a path.
   */
  it('no route file imports or names the screen', () => {
    const offenders = ROUTE_FILES.filter((r) =>
      /StatuteLinkedJudgmentsScreen|statuteLinkedTruth|linked-judgments/.test(r.source),
    ).map((r) => r.route);
    expect(offenders).toEqual([]);
  });

  it('and no route file is named for it', () => {
    expect(ROUTE_FILES.map((r) => r.route).filter((r) => /statute.*link|linked.*judg/i.test(r)))
      .toEqual([]);
  });
});

describe('nothing reachable navigates to it', () => {
  /**
   * A COMPONENT NOBODY MOUNTS. The screen is imported by its own tests and by
   * nothing else — not by a tab bar, not by the command palette, not by the
   * screen inventory, not by the `/s/<slug>` redirect map.
   */
  it('no production file outside the held surface imports the screen', () => {
    const offenders = PRODUCTION_SOURCE.filter(
      (s) => !HELD_SURFACE_FILES.includes(s.file) && /StatuteLinkedJudgmentsScreen/.test(s.source),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  /**
   * THE REDIRECT MAP IS THE ONE THAT WOULD BITE. `/s/<slug>` sends an inventory
   * slug to a real screen, and a row added there is a live destination reachable
   * from the screen directory.
   */
  it('the real-routes map names no statute-linked destination', () => {
    const realRoutes = readFileSync(join(SRC_DIR, 'screens', 'realRoutes.ts'), 'utf8');
    expect(realRoutes).not.toMatch(/statute.?linked|linked.?judgment/i);
  });

  /** And it did not become a fifth tab, or a fifth anything. */
  it('the tab bar is untouched', () => {
    const tabs = ROUTE_FILES.find((r) => r.route === '(tabs)/_layout.tsx');
    expect(tabs).toBeDefined();
    expect(tabs!.source).not.toMatch(/statute.?linked|linked.?judgment/i);
  });
});

describe('the capability registry did not move', () => {
  /**
   * `V1_SURFACE` IS THE FROZEN CLIENT REGISTRY. No surface was added for this,
   * deliberately: a row would be an edit to the one table this lane may not
   * change, for a screen that has no route to gate.
   */
  it('no statute-linked surface was added to V1_SURFACE', () => {
    const capabilities = readFileSync(join(SRC_DIR, 'state', 'capabilities.ts'), 'utf8');
    expect(capabilities).not.toMatch(/statuteLinked|linkedJudgments/);
  });

  /** And `statuteCorrespondence` is still held — a section is never widened. */
  it('the correspondence surface is still DISABLED_NOT_READY', () => {
    const capabilities = readFileSync(join(SRC_DIR, 'state', 'capabilities.ts'), 'utf8');
    expect(capabilities).toMatch(
      /statuteCorrespondence:\s*\{\s*v1:\s*'DISABLED_NOT_READY'/,
    );
  });
});

describe('the only thing that reaches the route is the request itself', () => {
  /**
   * ONE CALLER, ONE CALL SITE. The api client method and the held screen. If a
   * third file starts calling it, this fails — which is the whole point: the
   * surface stays held by construction rather than by anyone remembering.
   */
  it('exactly the client and the held screen name the method', () => {
    const callers = PRODUCTION_SOURCE.filter((s) => /statuteLinkedJudgments/.test(s.source)).map(
      (s) => s.file,
    );
    expect(callers.sort()).toEqual(
      ['api/client.ts', 'screens/statutes/StatuteLinkedJudgmentsScreen.tsx'].sort(),
    );
  });

  /**
   * AND NOTHING ASKS FOR THE UNREVIEWED TIER. 905,853 extractor pins nobody has
   * reviewed are not linked judgments; a product surface requesting them would
   * be showing them as such. Test files may — that is what the tier is for.
   */
  it('no production file requests structural_unreviewed', () => {
    const offenders = PRODUCTION_SOURCE.filter(
      (s) => s.file !== 'api/contract.ts' && /evidence:\s*'structural_unreviewed'/.test(s.source),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});
