import {resolve} from 'node:path'

import {includeIgnoreFile} from '@eslint/compat'
import eslintConfig from '@repo/eslint-config'

export default [includeIgnoreFile(resolve(import.meta.dirname, '.gitignore')), ...eslintConfig]
