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
    },
  },
  {
    // Repo tooling: plain Node scripts, run by hand and by CI, never bundled.
    // Without this `console`, `process` and `fetch` read as undefined globals and
    // every script here is a lint error — which is exactly how the design-rules
    // gate landed on main with `pnpm lint` red.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
  },
);
