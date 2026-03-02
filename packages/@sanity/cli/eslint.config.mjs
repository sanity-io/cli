import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  {
    ignores: ['templates/**'],
  },
  ...eslintConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              message:
                'Import from subpath instead to avoid barrel import. Example: `import {fn} from \'date-fns/fn\'`.',
              name: 'date-fns',
            },
            {
              message:
                'Import from subpath instead to avoid barrel import. Example: `import fn from \'lodash-es/fn.js\'`.',
              name: 'lodash-es',
            },
            {
              allowTypeImports: true,
              message:
                'Importing from sanity directly is not allowed. Use `resolveLocalPackage` function from @sanity/cli-core instead.',
              name: 'sanity',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['test/__fixtures__/**/*.ts'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'unicorn/prefer-string-raw': 'off',
    },
  },
]
