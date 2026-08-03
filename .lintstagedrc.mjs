export default {
  // JavaScript and TypeScript files: run ESLint fix first, then oxfmt
  '**/*.{js,jsx,ts,tsx,mjs,cjs}': [
    'pnpm exec eslint --fix',
    'pnpm exec oxfmt --no-error-on-unmatched-pattern',
  ],

  // Documentation and data files: run oxfmt
  '**/*.{md,json,jsonc,yaml,yml}': ['pnpm exec oxfmt --no-error-on-unmatched-pattern'],
}
