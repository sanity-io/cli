export default {
  // JavaScript and TypeScript files: run ESLint fix first, then Prettier
  '*.{js,ts,mjs,cjs}': ['eslint --fix', 'prettier --write'],

  // Markdown files: run Prettier
  '*.md': ['prettier --write'],
}
