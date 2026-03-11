export default {
  // JavaScript and TypeScript files: run ESLint fix first, then oxfmt
  '**/*.{js,ts,mjs,cjs}': ['npx eslint --fix', 'npx oxfmt --no-error-on-unmatched-pattern'],

  // Markdown files: run oxfmt
  '*.md': ['npx oxfmt --no-error-on-unmatched-pattern'],
}
