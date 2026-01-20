import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  ...eslintConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/scripts/*.js', 'eslint.config.mjs', 'vitest.config.ts'],
        },
      ],
    },
  },
]
