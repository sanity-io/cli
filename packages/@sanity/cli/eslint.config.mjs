import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@repo/eslint-config'

const gitignorePath = resolve(dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  ...eslintConfig,
  {rules: {'@typescript-eslint/no-explicit-any': 'warn'}},
]
