import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  {ignores: ['**/fixtures/prebuilt-*/dist/**', '.changeset/**']},
  ...eslintConfig,
]
