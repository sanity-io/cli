import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@sanity/eslint-config-cli'

export default [
  includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')),
  // scripts/bundle-experiment: standalone node tooling (bundler + validation
  // harnesses) run directly with node — console output and dynamic import are
  // the point; validated by execution, not lint
  {ignores: ['**/fixtures/prebuilt-*/dist/**', '.changeset/**', 'scripts/bundle-experiment/**']},
  ...eslintConfig,
]
