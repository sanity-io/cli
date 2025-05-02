import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@repo/eslint-config'

const __dirname = dirname(fileURLToPath(import.meta.url))
export default [
  includeIgnoreFile(resolve(__dirname, '.gitignore')),
  ...eslintConfig,
  {rules: {'@typescript-eslint/no-explicit-any': 'warn'}},
]
