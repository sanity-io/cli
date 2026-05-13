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
                "Import from subpath instead to avoid barrel import. Example: `import {fn} from 'date-fns/fn'`.",
              name: 'date-fns',
            },
            {
              message:
                "Import from subpath instead to avoid barrel import. Example: `import fn from 'lodash-es/fn.js'`.",
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
    // Colocated test scaffolding (shared fixtures, mock helpers) imports
    // from devDependencies the same way `*.test.ts` files do. Without
    // this, splitting test setup out of `*.test.ts` files trips the
    // extraneous-deps rule. `test/__fixtures__/**/*.ts` covered the
    // legacy project-test fixtures dir; `**/__tests__/**/*.ts` extends
    // the same exemption to colocated helpers next to source.
    files: ['test/__fixtures__/**/*.ts', '**/__tests__/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
      'import-x/no-unresolved': 'off',
    },
  },
]
