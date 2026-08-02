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
);
