import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Not source: build output, vendored design assets, the marketing site, and
    // generated migration SQL.
    //
    // `apps/**` carries its own `.eslintrc.json` and npm lockfiles; converging
    // the two toolchains is flagged, not done here.
    //
    // Every entry added 18 Sep 2026 (SHIP S4-T0.3) carries its CLASSIFICATION and
    // its reason. Nothing is ignored merely for having many errors: 145 problems
    // in active source and active tooling were FIXED instead, and the count each
    // exclusion removes is stated so the trade is visible.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.expo/**',
      '**/drizzle/**',
      'apps/**',
      'design/**',
      'website/**',
      /**
       * RAW_CAPTURE_FIXTURE — 2,156 of the repository's 2,719 lint errors, and
       * every one of them correct about code that is not ours.
       *
       * These are eCourts' OWN browser JavaScript, captured verbatim on a dated
       * day: jQuery-era globals, `$`, `document`, redeclared vars. Linting them
       * measures the Indian judiciary's coding style, not ours. More to the
       * point they must stay BYTE-FAITHFUL — `ecourts-derivation.ts` derives the
       * rotating `ajaxCall` header pair from these exact bytes, so a lint
       * autofix would turn a fact about what the server served into a fact about
       * our tidying. `.prettierignore` excludes the same directory for the same
       * reason.
       */
      'services/api/src/court/__fixtures__/**',
      /**
       * HISTORICAL_ONE_OFF_TOOL — 396 errors across 152 dot-prefixed files.
       *
       * One-off measurement scripts from the legacy NEW2 lane, tracked on
       * purpose because each produced a published number and a measurement
       * nobody can re-run is a measurement nobody can check. VERIFIED before
       * excluding: nothing imports them — `git grep` finds only prose mentions
       * and self-references. The leading dot is this repository's existing
       * marker for "operator artifact, not shipped", the same convention as the
       * `*.local.*` rule below. Editing one to satisfy a linter edits a frozen
       * record.
       *
       * They are NOT "untracked scratch" — the T0.2 record said that and it was
       * wrong. They are tracked, and that is the whole reason they are named
       * here rather than swept up by `.gitignore`.
       */
      '**/.n2*',
      /**
       * Round receipts, not source. `docs/**` is the evidence tree: every
       * `.mjs`/`.mts` under it is the exact probe a dated record cites — e.g.
       * `docs/ai/new3-r18/probe-matters-parties.mts` is named in
       * `r16-independent-acceptance.json`. A lint fix there changes cited
       * evidence, and some of that tree is hash-bound (`docs/ai/**` sha256
       * manifests). Same class as `design/**` above.
       */
      'docs/**',
      /**
       * NOT IN THE REPOSITORY. ESLint does not read `.gitignore`, so a gate that
       * CI passes on a clean checkout fails on a working tree that has operator
       * artifacts in it — 1,908 of the 1,910 problems left after the fixes above
       * lived here, and none of them is committed:
       *
       *   .scratch/**      gitignored operator scratch (`.gitignore`), 1,675
       *   .agents/tmp/**   agent temp files, 54
       *   .venv-ocr/**     a PYTHON VIRTUALENV; the hits are vendored JS inside
       *                    pip packages, 12
       *   .tmp-new2/**     gitignored temp, 1
       *
       * Same argument as `*.local.*` below, which this config already made once:
       * one throwaway in the tree should not break `pnpm lint` for everybody.
       */
      '.scratch/**',
      '.agents/tmp/**',
      '.venv-ocr/**',
      '.tmp-new2/**',
      /**
       * `*.local.*` is the agreed name for a throwaway an operator wrote to
       * poke at something — `services/api/get-token.local.mjs` is one. They are
       * untracked and never shipped, and having one in the tree currently
       * breaks `pnpm lint` for everybody, which is a worse outcome than not
       * linting a scratch file.
       */
      '**/*.local.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      /**
       * A LEADING UNDERSCORE MEANS "DELIBERATELY UNUSED", which is the
       * convention this repo was already writing before the config knew it:
       * `hyde.test.ts` and `rerank-passages.test.ts` both stub a callback as
       * `(_s, _v) => …` to satisfy a signature, and both were lint errors for
       * naming the unused thing clearly. The alternative — deleting the
       * parameters — changes the stub's arity and is worse.
       *
       * Everything without the underscore still errors, so a genuinely
       * forgotten variable is still caught.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      /**
       * OFF, 18 Sep 2026 (SHIP S4-T0.3), and this is the only rule this round
       * turns off.
       *
       * `no-useless-assignment` fired 22 times and every single one was the same
       * shape — the FAIL-CLOSED INITIALISER:
       *
       *     let finalState: FinalState = 'ACTIONABLE_FAILURE';
       *     try { … finalState = 'RECOVERED'; } catch { … }
       *
       * The rule is correct that `'ACTIONABLE_FAILURE'` is never read today. It
       * is wrong about what the value is FOR. Deleting it to satisfy the rule
       * would do three bad things at once: remove the safe default, break
       * TypeScript's definite-assignment analysis in the `.ts` sites, and make
       * the next `catch` branch that forgets to assign produce `undefined`
       * instead of the conservative answer. `release/candidate.ts`,
       * `arguments/counter.ts` and `search/saved.ts` all use it deliberately —
       * `semanticAvailable = false` before a `try` that may never run is the
       * whole reason a degraded search reports degraded.
       *
       * A rule whose only fix makes the code less safe is a rule this repository
       * should not run. Scoped alternatives were considered and rejected: the 22
       * sites span `scripts/**`, `services/api/src/**` and
       * `services/harness/src/**`, so a path override would not be narrower in
       * any meaningful sense, and 22 inline disables would be the same decision
       * written 22 times.
       */
      'no-useless-assignment': 'off',
    },
  },
  {
    /**
     * `scripts/**` is one-off probes and round tooling: each file ran once,
     * produced a published number, and is kept so the number can be re-derived.
     * They read UNTYPED upstream JSON (the India Code DSpace API, S3 list-bucket
     * XML) and untyped `sql.unsafe()` rows.
     *
     * `no-explicit-any` fired 16 times across 7 of those files and nowhere else.
     * Writing an interface for a foreign API's response shape inside a script
     * that ran once is not type safety — it is a second, unverified copy of
     * somebody else's schema, wrong the moment they change it, in a file nobody
     * will update. So the rule is off HERE and stays `'error'` everywhere that
     * ships: `services/**` and `packages/**` are untouched by this override.
     */
    files: ['scripts/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Repo tooling: plain Node scripts, run by hand and by CI, never bundled.
    // Without this `console`, `process` and `fetch` read as undefined globals and
    // every script here is a lint error — which is exactly how the design-rules
    // gate landed on main with `pnpm lint` red.
    // `services/harness/probes/**` joins for the same reason and under the same
    // rule: they are plain Node scripts run by hand, kept because each produced
    // a published number and a measurement nobody can re-run is a measurement
    // nobody can check. Nothing imports them.
    // `services/harness/src/**/*.mjs` joins 20 Aug 2026 for exactly the same
    // reason and after the same failure: 159 of the repo's 161 lint errors were
    // NEW1's measurement scripts reading `process`, `console`, `fetch` and `URL`
    // as undefined globals, which made `pnpm lint` — and therefore `ci:local` —
    // red for every lane over code that is correct. They are plain Node scripts
    // run by hand, nothing imports them, and each one produced a published
    // number.
    // `packages/db/factory/**/*.mjs` joins 18 Sep 2026 after the same failure a
    // third time: all 29 of its lint errors were `URL`, `process` and `console`
    // reading as undefined globals in the legal-object factory, which is a
    // hand-run Node tool exactly like the two above. A rule that has now caught
    // the same correct code three times is a gap in the config, not a defect in
    // the code.
    files: [
      'scripts/**/*.mjs',
      'scripts/**/*.mts',
      'services/harness/probes/**/*.mjs',
      'services/harness/src/**/*.mjs',
      'packages/db/factory/**/*.mjs',
    ],
    languageOptions: {
      // `AbortSignal` joins the list for the same reason the others are here:
      // `AbortSignal.timeout()` is the standard way a script bounds a fetch, and
      // without the declaration a correctly-written timeout reads as a typo.
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        // `AbortController` and `performance` join 15 Sep 2026 for the same
        // reason and after the same shape of failure. A runner that measures a
        // deployed API needs a wall clock that is not `Date.now()` and a way to
        // abandon a request at the client timeout the product actually ships;
        // without these two declarations the CORRECT version of
        // `lcc-staging-gate-s1.mjs` lints worse than one that measures nothing
        // and never gives up.
        AbortController: 'readonly',
        performance: 'readonly',
        // A script that loops over long-running children needs both halves of
        // the timer pair. `legal-object-factory.mjs` bounds each batch and
        // clears the timer when the child exits; without these declarations the
        // correct version of that lints worse than the version that leaks.
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // `Buffer` and `TextEncoder` join 18 Sep 2026. A script that reads a
        // binary artifact or measures a payload in BYTES rather than characters
        // needs them, and without the declarations the byte-correct version of
        // `worker-truth.mjs` and `new3-acceptance-delta.mjs` lints worse than a
        // version that counts UTF-16 code units and calls them bytes.
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // A test that fakes a child process has to resolve the exit event on a
        // later turn of the loop or the listener is not attached yet.
        queueMicrotask: 'readonly',
      },
    },
  },
);
