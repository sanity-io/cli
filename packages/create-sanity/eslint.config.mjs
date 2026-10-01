import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  ...eslintConfig,
  {
    rules: {
      // Everything is bundled into `dist` at build time; the published package has no dependencies
      'import-x/no-extraneous-dependencies': ['error', {devDependencies: true}],
      // `@sanity/cli-core` is not available here; `src/ui.ts` wraps the prompts with the same checks
      'no-restricted-imports': 'off',
      // The bin loads the bundle after checking the Node.js version
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Fake child processes have to be `EventEmitter`s, like the real ones
    files: ['test/**/*.ts'],
    rules: {'unicorn/prefer-event-target': 'off'},
  },
]
