export default {
  // JavaScript and TypeScript files: run ESLint fix first, then Prettier
  '!(packages/@sanity/cli/templates/**)*.{js,ts,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  // Just run prettier on templates
  'packages/@sanity/cli/templates/**/*.{js,ts,mjs,cjs}': ['prettier --write'],

  // Markdown files: run Prettier
  '*.md': ['prettier --write'],
}
