import baseConfig from '@repo/oxc-config/oxlint'
import {defineConfig} from 'oxlint'

export default defineConfig({
  ...baseConfig,
  rules: {...baseConfig.rules, 'no-console': 'off', 'typescript/no-explicit-any': 'warn'},
})
