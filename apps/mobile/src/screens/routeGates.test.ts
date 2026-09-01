import { V1_SURFACE, type SurfaceName } from '../state/capabilities';

/**
 * NODE BUILT-INS, TYPED LOCALLY RATHER THAN BY A NEW DEPENDENCY.
 *
 * Same reason and same shape as `citation/adversarial.test.ts`, which reached
 * it first: `@types/node` is not in this workspace's `tsconfig.json` (`types`
 * lists only `jest`), and adding it would touch the root lockfile while other
 * lanes are working in the same tree, to satisfy the imports of two test files.
 * Jest runs on node, so these resolve at runtime; this only tells the compiler
 * what they are.
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROUTE SWEEP — every gate asserted at the file that carries it.
 *
 * NEW3 R15 §7 found one real capability leak of the four it examined, and one
 * more nobody had raised: `/matter-sharing/[id]` mounted a `POST_V1` screen
 * unconditionally because only its BUTTON was gated, and `/directory` and
 * `/gallery` shipped in the binary with no `__DEV__` guard — reachable from any
 * 404, because `+not-found` offered the screen inventory as a recovery action.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A RENDER TEST. The property being pinned is
 * REACHABILITY, which is a fact about which file wraps which — a render test
 * proves one route behaves and says nothing about the twenty-nine others, or
 * about the one somebody adds next month. This walks all of them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const APP_DIR = join(__dirname, '..', '..', 'app');
const SRC_DIR = join(__dirname, '..');

function walk(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(entry)) out.push(full);
  }
  return out;
}

const ROUTES = walk(APP_DIR, (n) => n.endsWith('.tsx')).map((f) => ({
  route: relative(APP_DIR, f).split(sep).join('/'),
  source: readFileSync(f, 'utf8'),
}));

function sourceOf(route: string): string {
  const found = ROUTES.find((r) => r.route === route);
  if (!found) throw new Error(`no route file ${route} — this test is now lying about the app`);
  return found.source;
}

function screenSource(...parts: string[]): string {
  return readFileSync(join(SRC_DIR, ...parts), 'utf8');
}

const heldSurfaces = (Object.keys(V1_SURFACE) as SurfaceName[]).filter(
  (name) => V1_SURFACE[name].v1 !== 'ENABLED_V1',
);

describe('the app still has the routes this test is about', () => {
  it('walks the whole route tree rather than a hand-written list', () => {
    expect(ROUTES.length).toBeGreaterThan(25);
  });
});

/**
 * `CapabilityBoundary`'s own docstring is the spec: "keeps a held route absent
 * even when a stale deep link still names it." Children are not mounted while
 * the gate is closed, so their API effects never run.
 */
describe('held surfaces are gated at the route, not only at the button', () => {
  it.each([
    ['matter-sharing/[id].tsx', 'matterSharing'],
    ['(tabs)/drafts.tsx', 'drafting'],
    ['document/[id].tsx', 'drafting'],
    ['briefing/[id].tsx', 'briefing'],
    ['counter-arguments.tsx', 'counterArguments'],
  ])('%s is wrapped in CapabilityBoundary surface="%s"', (route, surface) => {
    const src = sourceOf(route);
    expect(src).toContain('CapabilityBoundary');
    expect(src).toContain(`surface="${surface}"`);
  });

  /**
   * MATTER SHARING IS THE ONE THIS ROUND FIXED, so it is asserted twice: that
   * the wrapper is there, and that the surface it names is still held. A gate
   * pointing at a surface somebody later opened is not a gate.
   */
  it('matterSharing is still POST_V1, so the gate above still means something', () => {
    expect(V1_SURFACE.matterSharing.v1).toBe('POST_V1');
    expect(heldSurfaces).toContain('matterSharing' as SurfaceName);
  });

  it('drafting and briefing are still held', () => {
    expect(heldSurfaces).toEqual(expect.arrayContaining(['drafting', 'briefing'] as SurfaceName[]));
  });
});

/**
 * BUILD SCAFFOLDING LEAVES THE BINARY. `__DEV__` is `false` in a release bundle
 * and the minifier drops the dead branch, so in production these answer with the
 * same "that route does not exist" an unknown slug gets.
 */
describe('development-only routes do not ship', () => {
  it.each(['directory.tsx', 'gallery.tsx'])('%s refuses outside development', (route) => {
    const src = sourceOf(route);
    expect(src).toContain('__DEV__');
    expect(src).toMatch(/if \(!?__DEV__\)|if \(notInProduction\)/);
    expect(src).toContain('Redirect');
  });

  /**
   * BOTH ENDS. Guarding the route while still offering it from a 404 would leave
   * a store build one wrong link away from a dead end that used to be a
   * browsable list of every screen in the product.
   */
  it('the 404 does not offer the screen inventory in production', () => {
    const src = sourceOf('+not-found.tsx');
    expect(src).toContain('__DEV__');
    // The offer sits inside the guard, never beside it.
    expect(src.indexOf('Open the screen inventory')).toBeGreaterThan(src.indexOf('__DEV__'));
  });
});

describe('no link points at a destination the app then ignores', () => {
  /**
   * NEW3 R15 §8 I1 — "Open the briefing" pushed `/matter/[id]` with a `briefing`
   * param `MatterScreen` reads nowhere, so it was byte-for-byte the "Open the
   * matter" link beneath it; and `briefing` is held anyway. Restore it WITH the
   * param when the surface opens.
   */
  it('the cause list no longer offers a briefing that cannot open', () => {
    const causeList = screenSource('screens', 'causelist', 'CauseListScreen.tsx');
    expect(causeList).not.toContain('label="Open the briefing"');
    expect(causeList).not.toMatch(/params:\s*\{\s*id,\s*briefing/);
  });

  /**
   * NEW3 R15 §8 I4 — the act reader told the advocate section numbers were
   * tappable anchors. The rows are plain `<View>`; the only `Pressable` on the
   * screen is Back. Building the anchor is a feature; the false sentence was
   * the bug.
   */
  it('the act reader does not claim a tap it cannot answer', () => {
    expect(screenSource('screens', 'statutes', 'ActReaderScreen.tsx')).not.toContain(
      'tap one to link it',
    );
  });

  /**
   * NEW3 R15 §8 I5 — an advocate who tapped "Save to matter" from a judgment on
   * a fresh account reached "No matters yet." with no action at all, and
   * `/matter/new` existed the whole time.
   */
  it('the empty matter picker offers the route out of it', () => {
    const picker = screenSource('screens', 'judgment', 'MatterPicker.tsx');
    expect(picker).toContain('Create a matter');
    expect(picker).toContain('/matter/new');
  });

  /**
   * NEW3 R15 §8 I6 — `statute.lookup` is `ENABLED_V1`, `/acts` and `/acts/[id]`
   * were mounted, `GET /statutes` was live, and NOTHING in the app navigated
   * there. Settings and the search empty state, not a fifth tab:
   * `DESIGN_SYSTEM.md` fixes the bar at four.
   */
  it('Bare Acts is reachable from Settings and from search', () => {
    expect(sourceOf('settings.tsx')).toContain("'/acts'");
    expect(screenSource('screens', 'search', 'SearchScreen.tsx')).toContain("'/acts'");
  });

  it('and Bare Acts did not become a fifth tab', () => {
    expect(sourceOf('(tabs)/_layout.tsx')).not.toContain('acts');
  });

  /**
   * NEW3 R15 §7 L4 — the palette gated the "Open drafts" ACTION and not the
   * recent ROWS, so a stale `kind: 'draft'` entry advertised a destination the
   * capability boundary then silently refused.
   */
  it('the command palette filters draft recents by the same gate as the action', () => {
    const palette = screenSource('components', 'CommandPalette.tsx');
    expect(palette).toMatch(/r\.kind !== 'draft' \|\| draftingEnabled/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATIC PRODUCTION-COPY AUDIT.
 *
 * The design pack this round integrates is ILLUSTRATIVE, and it carries claims
 * this product cannot make: SMS OTP sign-in when the app is email magic-link, a
 * hard "delete matter", "34 judgments offline", "714 Acts", a ₹19,990 plan,
 * trial days, a 30-day export promise, "we do not search by a person's name" as
 * a global rule, "safe to file", and "good law".
 *
 * REACHABILITY DECIDES, NOT A TEXT MATCH. A phrase inside a test that forbids
 * it, or inside a fixture that never renders, is not a defect — so those are
 * excluded by name rather than by hoping the regex misses them.
 *
 * AND COMMENTS ARE NOT COPY. This codebase explains at length why it never
 * makes a forward good-law claim; the first run of this audit flagged twenty
 * files, and every one of them was a comment saying the thing must not be said.
 * Stripping comments first is not a loophole — it is the difference between
 * auditing what an advocate reads and auditing what a developer reads.
 *
 * ONE PHRASE IS DELIBERATELY NOT BANNED: "Safe to file".
 *
 * It looks like exactly the kind of claim this audit exists to catch, and it is
 * the opposite — it is the SETTLED shipping copy, recorded with its reasoning in
 * `citation/renderState.ts`: "copy is licence protection, not an audit... 'We
 * verified this citation' → 'Safe to file'." It is a statement about the
 * CITATION (it exists, and nothing we hold says it has moved), never about the
 * proposition it is cited for, and the same decision retired "we verified this"
 * for being the audit-flavoured wording. Banning it here would reverse a
 * decision this round has no authority to reopen, so it is named and left
 * alone rather than quietly dropped from the list.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

describe('no illustrative claim reached production copy', () => {
  const REACHABLE: { file: string; text: string }[] = [
    ...walk(SRC_DIR, (n) => (n.endsWith('.ts') || n.endsWith('.tsx')) && !n.includes('.test.'))
      .map((f) => ({
        file: relative(SRC_DIR, f).split(sep).join('/'),
        text: withoutComments(readFileSync(f, 'utf8')),
      }))
      .filter(
        (s) =>
          // Never rendered in a production build: fixture data, the screen
          // shells that describe undesigned screens, and the inventory manifest.
          s.file !== 'api/fixtures.ts' &&
          !s.file.startsWith('screens/ScreenShell') &&
          !s.file.startsWith('screens/manifest') &&
          // `V1_SURFACE`'s `note` fields are a comment that happens to be a
          // string literal — the table's own docstring says they are "for the
          // internal capability screen… never shown to an advocate", and
          // grepping the app confirms nothing reads `.note` off a surface. One
          // of them is the sentence "we never claim an authority is good law",
          // which the audit would otherwise flag as the claim it forbids.
          s.file !== 'state/capabilities.ts',
      ),
    ...ROUTES.filter((r) => !['directory.tsx', 'gallery.tsx'].includes(r.route)).map((r) => ({
      file: `app/${r.route}`,
      text: withoutComments(r.source),
    })),
  ];

  const BANNED: [string, RegExp][] = [
    ['SMS OTP sign-in, when the app is email magic-link', /one-time code|\bOTP\b|sent to \+91/i],
    ['a hard matter delete the contract does not support', /delete (this |the )?matter/i],
    ['saving an authority outside a matter', /save without a matter/i],
    ['a count of judgments held offline', /\d+\s+judgments?\s+(saved\s+)?(on this phone|offline)/i],
    ['a count of Acts held', /\b\d{2,}\s+Acts\b/],
    /**
     * THE DESIGN PACK'S PLAN, NOT OURS. `SubscriptionScreen` carries three real
     * hardcoded tier prices under PD-13 ("the site names win, the docs move"),
     * which is a settled decision and not this round's to reopen. What may not
     * appear is the pack's illustrative ₹19,990 Chamber plan and its renewal
     * date, which correspond to no tier this product sells.
     */
    ['the design pack plan price', /₹\s?19,?990/],
    ['trial days', /trial[^.]{0,20}\bdays?\b/i],
    ['an export or deletion SLA', /(within|under)\s+(30 days|a week)/i],
    ['practice areas reordering search', /practice areas?[^.]{0,40}(order|reorder)/i],
    ['a daily cause-list pull driven by the profile', /pull the daily cause list/i],
    ['party-name search stated as a global product rule', /do not search by a person/i],
    /**
     * "GOOD LAW" AS A CLAIM ABOUT AN AUTHORITY WE ARE SHOWING.
     *
     * The negative is not the positive, and the distinction is the product.
     * "This judgment is no longer good law" is the LAW MOVED banner and is a
     * statement about a recorded change; "it was good law until this judgment"
     * is history. What `treatment.good_law_claim` being `DISABLED_NOT_READY`
     * forbids is the forward claim — and the filter subtitle "Good law only"
     * was making it, over a switch that only excludes what we have RECORDED as
     * set aside or doubted. Corrected this round in `FiltersSheet.tsx`,
     * `SearchScreen.tsx` and `api/mock.ts`.
     */
    ['a forward good-law claim', /good law only|is good law\b|still good law\b/i],
  ];

  it.each(BANNED)('%s appears nowhere reachable', (_why, pattern) => {
    expect(REACHABLE.filter((s) => pattern.test(s.text)).map((s) => s.file)).toEqual([]);
  });
});
