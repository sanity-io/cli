import baseConfig from '@repo/oxc-config/oxlint'
import {defineConfig} from 'oxlint'

export default defineConfig({
  ...baseConfig,
  rules: {...baseConfig.rules, 'typescript/no-explicit-any': 'warn'},
})
