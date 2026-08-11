/**
 * NODE BUILT-INS, TYPED LOCALLY RATHER THAN BY A NEW DEPENDENCY.
 *
 * `@types/node` is not installed in this workspace and `tsconfig.json` lists
 * only `jest`. Adding the package would touch the root lockfile while the other
 * lane is working in the same tree, to satisfy two imports in one test — so the
 * three functions actually used are declared here instead. Jest runs on node,
 * so they resolve at runtime; this only tells the compiler what they are.
 */
declare const __dirname: string;
declare function require(id: string): unknown;

const { readFileSync, readdirSync, statSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
  readdirSync: (path: string) => string[];
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * ADVERSARIAL CLIENT SAFETY — REB §13, and they are ABSENCE tests.
 *
 * Most of this file asserts that something is NOT in the client. That is
 * deliberate: the failures REB names are not bugs in a function, they are
 * whole capabilities the client must never grow. A unit test cannot catch
 * "somebody added a concordance table"; scanning the source can.
 *
 * These tests are safety tests. REB §9 and §13: do not weaken them to make an
 * implementation pass. If one fails, the client has taken on a legal
 * responsibility it is not allowed to have.
 */

const SRC = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(path);
  }
  return out;
}

/** Comments state rules and cite sources; code makes claims. Only code is scanned. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FILES = sourceFiles(SRC);

describe('the client holds no statute concordance', () => {
  /**
   * REB §7: *"For IPC/BNS, CrPC/BNSS and IEA/BSA, never hardcode simplistic
   * section-number equivalences."*
   *
   * `DOMAIN_TRUTH.md` is the only place a mapping may live, and
   * `statute_mappings` is 0 rows BY DESIGN — India Code's IPC handle serves an
   * incomplete Act. A client-side table would be inventing legal equivalence
   * for the sections nobody has mapped, and "old section N = new section N" is
   * wrong far more often than it is right.
   */
  it('maps no old-code section to a new-code section anywhere', () => {
    const offenders = FILES.filter((f) => {
      /**
       * `manifest.ts` is GENERATED inventory data, not logic. It carries the
       * screen title "IPC ↔ BNS comparison" — a screen that exists to DISPLAY a
       * mapping the BACKEND supplies. Naming the screen is not holding the
       * mapping, and `statute_mappings` is 0 rows by design.
       */
      if (f.endsWith(join('screens', 'manifest.ts'))) return false;
      const code = codeOf(f);
      // A mapping needs both regimes named together in executable code.
      const oldCode = /\b(IPC|CrPC|Evidence Act|I\.P\.C)\b/i.test(code);
      const newCode = /\b(BNS|BNSS|BSA)\b/i.test(code);
      return oldCode && newCode;
    });

    expect(offenders).toEqual([]);
  });

  it('declares no equivalence helper by name', () => {
    const offenders = FILES.filter((f) =>
      /\b(sectionEquivalent|mapSection|ipcToBns|bnsToIpc|concordance)\b/i.test(codeOf(f))
    );

    expect(offenders).toEqual([]);
  });
});

describe('the client never labels an authority good law', () => {
  /**
   * REB §6: *"Do not turn uncertain treatment into a definitive 'good law'
   * label."* And `CITATION_HARNESS.md`: verified is SILENT. A positive stamp is
   * the one thing this product refuses to print, because a stamp is what an
   * advocate would rely on instead of reading.
   *
   * `standingWhenRelied: 'good_law_then'` is a backend field about a point in
   * time and may be rendered as such — what may never appear is a present-tense
   * claim that an authority IS good law.
   */
  /**
   * NOTE ON "Safe to file", which is NOT banned here and was in an early draft
   * of this test by mistake. `CLAUDE.md` and `CITATION_HARNESS.md` both make it
   * the SHIPPING phrase — *"'Safe to file', never 'we verified this'"* — and it
   * appears in exactly one place, `VerificationSheet`, which the advocate opens
   * deliberately. Verified-is-silent governs cards and lists, where we would be
   * volunteering a stamp; a sheet the user asked for is the one surface allowed
   * to answer. `scripts/check-design-rules.mjs` bans the phrase in DESIGN
   * RENDERS, which is a different surface and a different rule.
   */
  it('prints no good-law stamp in any rendered string', () => {
    const banned = [
      /"Good law"/i,
      />\s*Good law\s*</i,
      /'Good law'/i,
      /\bVerified Primary Source\b/i,
      /\bCitation verified\b/i,
      /\bWe verified this\b/i,
    ];

    const offenders: string[] = [];
    for (const f of FILES) {
      const code = codeOf(f);
      for (const re of banned) if (re.test(code)) offenders.push(`${f} :: ${re}`);
    }

    expect(offenders).toEqual([]);
  });

  /** Retired copy, `DESIGN_SYSTEM.md` §Retired / Ships. */
  it('never says verification failed — an outage is not a corpus gap', () => {
    const offenders = FILES.filter((f) => /verification failed/i.test(codeOf(f)));

    expect(offenders).toEqual([]);
  });
});

describe('the client invents no citation metadata', () => {
  /**
   * REB §1: never generate a placeholder citation, never turn null into a
   * string, never emit "n.d." or invented citation metadata.
   */
  it('emits no citation placeholder anywhere', () => {
    const banned = [/['"]n\.d\.['"]/i, /\[no citation\]/i, /['"]Citation unavailable['"]/i];

    const offenders: string[] = [];
    for (const f of FILES) {
      const code = codeOf(f);
      for (const re of banned) if (re.test(code)) offenders.push(`${f} :: ${re}`);
    }

    expect(offenders).toEqual([]);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * A MISSING STATUS IS NEVER DEFAULTED INTO A GOOD ONE.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Found in `DraftDetailScreen` on 11 Aug 2026:
   * `overruledStatus: citation.overruledStatus ?? 'none'`.
   *
   * `readDocument` reads that field through a `LEFT JOIN judgments`, so null
   * means the citation matched no judgment we hold and its good-law status is
   * UNKNOWN. The coercion turned that into "the law has not moved" — and on
   * every surface in this product the ABSENCE of a moved mark is exactly how we
   * say the law has not moved. Silence is the good-law signal here, so spending
   * it on an unknown is a positive claim we did not earn, on a document about
   * to be filed.
   *
   * It read as harmless housekeeping — `citationRender` takes the non-null
   * union, so the `??` looks like a type accommodation. That is what makes it
   * worth scanning for rather than trusting review to catch.
   *
   * The rule is one-directional: absence may always fall to the SAFER reading
   * (`citationRender` itself defaults a missing `verificationState` to
   * unconfirmed, which is why that is written there and not here). What is
   * banned is a call site quietly supplying the reassuring value.
   */
  it('defaults no citation state field into a reassuring value', () => {
    const banned = [
      /overruledStatus[^\n]*\?\?\s*['"]/,
      /verificationState[^\n]*\?\?\s*['"]/,
      /verifiedBySource[^\n]*\?\?\s*['"]/,
      /overruledStatus\s*:\s*[^,\n]*\|\|\s*['"]/,
    ];

    const offenders: string[] = [];
    for (const f of FILES) {
      const code = codeOf(f);
      for (const re of banned) if (re.test(code)) offenders.push(`${f} :: ${re}`);
    }

    expect(offenders).toEqual([]);
  });

  /**
   * The specific defect that reached production: a template literal filled with
   * `null`. Any surface interpolating the raw field is one citationless row away
   * from putting "null" in front of an advocate.
   */
  it('interpolates no raw neutralCitation outside the one helper', () => {
    const offenders = FILES.filter((f) => {
      if (f.endsWith(join('citation', 'citationDisplay.ts'))) return false;
      if (f.endsWith(join('api', 'contract.ts'))) return false;
      if (f.endsWith(join('api', 'fixtures.ts'))) return false;
      if (f.endsWith(join('api', 'mock.ts'))) return false;
      return /\$\{[^}]*neutralCitation[^}]*\}|\{\s*\w+\.neutralCitation\s*\}/.test(codeOf(f));
    });

    expect(offenders).toEqual([]);
  });
});
