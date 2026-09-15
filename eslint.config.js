import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Not source: build output, vendored design assets, the marketing site, and
    // generated migration SQL.
    //
    // `apps/**` is RCC's lane and currently carries its own `.eslintrc.json` and
    // npm lockfiles — flagged to the founder rather than converged from this lane.
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
    files: [
      'scripts/**/*.mjs',
      'services/harness/probes/**/*.mjs',
      'services/harness/src/**/*.mjs',
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
      },
    },
  },
);
