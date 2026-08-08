#!/usr/bin/env node
/**
 * Assert that the reserved amber means only one thing.
 *
 *   node scripts/check-amber-reservation.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE, AND WHY IT IS LOAD-BEARING RATHER THAN COSMETIC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `CLAUDE.md` §6 and `apps/mobile/src/theme/tokens.ts`'s own doc comment:
 *
 *   > **AMBER IS RESERVED.** caution `#B4690E` means exactly one thing — THE
 *   > LAW HAS MOVED. It does not appear on drafts, on OCR, or on anything
 *   > about our own confidence. When an advocate sees amber it is about the
 *   > law, not about us. Anything expressing OUR uncertainty is neutral ink
 *   > with a dashed edge.
 *
 * This looks like a styling preference and is not. `CITATION_HARNESS.md` sets
 * the stale-overruled rate at a **zero** threshold and grades it as severely
 * as a hallucination, because an advocate who files overruled law is the
 * failure that ends the company. The `LAW MOVED` treatment is the only thing
 * standing between them and that, and **its power comes entirely from being
 * the only place this colour appears.**
 *
 * Every additional amber surface — however reasonable on its own — teaches an
 * advocate that amber sometimes means "an administrative note about Lawmind".
 * Once it means two things it means nothing, and the dilution is invisible:
 * no test fails, no metric moves, and the badge still renders. It shows up
 * years later as an advocate who skimmed past the one banner that mattered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN ALLOW-LIST RATHER THAN A CLEVER HEURISTIC
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same shape as the "no second door to eCourts" sweep in
 * `services/api/src/court/guard.test.ts`. A heuristic that tried to infer
 * intent from surrounding identifiers would pass anything named plausibly, and
 * the failure mode here is precisely a reasonable-looking use. So: the files
 * permitted to draw amber are listed, each with the reason it qualifies, and
 * anything new has to state its case in this file rather than in a diff nobody
 * reads.
 *
 * **Found by this rule, 8 Aug 2026:** `EnrolmentBand.tsx` and
 * `ProfileScreen.tsx`'s pending card both drew the reserved amber for
 * *enrolment verification pending* — a fact entirely about our own process,
 * which is the exact case the rule names. Neither was caught by the existing
 * gates, because `#B4690E` **is** in the palette: `check-design-rules.mjs`
 * asks whether a colour is allowed to exist, never whether it is allowed
 * *there*.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';

/** The tokens that carry the reserved meaning. */
const RESERVED = ['state.caution', 'state.cautionWash', 'state.cautionText'];
/** And the raw hexes, in case somebody bypasses the token. */
const RESERVED_HEX = ['#B4690E', '#FBF0DF', '#8A5109'];

/**
 * Files permitted to draw amber, and why each one is about THE LAW MOVING
 * rather than about us.
 */
const ALLOWED = new Map([
  ['components/CitationMark.tsx', 'the LAW MOVED mark itself — the canonical use'],
  ['components/ResultCard.tsx', 'a search result whose authority has moved'],
  ['screens/draft/CompareSummary.tsx', 'a citation in a draft whose authority moved'],
  ['screens/draft/DocumentReview.tsx', 'same, in review'],
  ['screens/judgment/AuthoritiesPanel.tsx', 'an authority that has been set aside'],
  ['screens/judgment/JudgmentScreen.tsx', 'the overruled banner on the judgment itself'],
  ['screens/judgment/ReadingView.tsx', 'an overruled passage in the reading view'],
  ['screens/precedent/PrecedentSpine.tsx', 'the moved node in the precedent graph'],
  ['screens/precedent/TreatmentCard.tsx', 'a treatment that moved the law'],
  ['theme/tokens.ts', 'defines the tokens'],
]);

const ROOTS = ['apps/mobile/src', 'apps/admin/app', 'apps/admin/components', 'apps/admin/lib'];

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = `${dir}/${entry}`;
    out = statSync(full).isDirectory() ? out.concat(walk(full)) : out.concat(full);
  }
  return out;
}

const problems = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const raw = readFileSync(file, 'utf8');

    /**
     * **Strip comments first.** Three files name `#B4690E` in a doc comment in
     * order to explain that they are deliberately NOT using it — RCC obeying
     * the rule and writing down why. Flagging those would be the gate
     * punishing exactly the behaviour it exists to encourage, and a gate that
     * cries wolf on correct code is one people learn to skip.
     *
     * The mention must be in the code to count.
     */
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    const used = [
      ...RESERVED.filter((t) => text.includes(t)),
      ...RESERVED_HEX.filter((h) => text.toUpperCase().includes(h)),
    ];
    if (used.length === 0) continue;

    // Match on the tail of the path so the check is not tied to one root.
    const permitted = [...ALLOWED.keys()].some((allowed) => file.endsWith(allowed));
    if (!permitted) {
      problems.push({ file, used: [...new Set(used)] });
    }
  }
}

if (problems.length > 0) {
  console.error('AMBER IS RESERVED — it means THE LAW HAS MOVED, and nothing else.\n');
  for (const p of problems) {
    console.error(`  ${p.file}`);
    console.error(`     draws ${p.used.join(', ')}`);
  }
  console.error(
    '\ntokens.ts: "It does not appear on drafts, on OCR, or on anything about our\n' +
      'own confidence. When an advocate sees amber it is about the law, not about us.\n' +
      'Anything expressing OUR uncertainty is neutral ink with a dashed edge."\n\n' +
      'This is not a styling preference. The stale-overruled threshold is ZERO and the\n' +
      'LAW MOVED treatment is the only thing standing between an advocate and filing\n' +
      'overruled law. Its power comes entirely from being the only place this colour\n' +
      'appears — once amber means two things it means nothing, and the dilution is\n' +
      'invisible until it costs somebody a case.\n\n' +
      'Either use neutral ink with a dashed edge, or — if this genuinely IS about the\n' +
      'law moving — add the file to ALLOWED in this script with the reason.',
  );
  process.exit(1);
}

console.log(
  `amber reservation ok · ${ALLOWED.size} files permitted to draw it, all about the law moving`,
);
