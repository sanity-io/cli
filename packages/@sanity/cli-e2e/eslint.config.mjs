import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  ...eslintConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // This is a private test-only package — all deps are devDependencies
      'import-x/no-extraneous-dependencies': 'off',
      'no-console': 'off',
    },
  },
]
