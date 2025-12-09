import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@repo/eslint-config'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  ...eslintConfig,
  {rules: {'@typescript-eslint/no-explicit-any': 'warn'}},
  {
    files: ['test/__fixtures__/**/*.ts'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
]
