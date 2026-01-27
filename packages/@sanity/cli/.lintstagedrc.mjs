export default {
  // JavaScript and TypeScript files: run ESLint fix first, then Prettier
  '**/*.{js,ts,mjs,cjs}': ['npx eslint --fix', 'npx prettier --write'],

  // Markdown files: run Prettier
  '*.md': ['npx prettier --write'],
}
