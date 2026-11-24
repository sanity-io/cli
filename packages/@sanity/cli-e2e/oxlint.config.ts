import baseConfig from '@repo/oxc-config/oxlint'
import {defineConfig} from 'oxlint'

export default defineConfig({
  ...baseConfig,
  rules: {
    ...baseConfig.rules,
    // This is a private test-only package — all deps are devDependencies
    'import-js/no-extraneous-dependencies': 'off',
    'no-console': 'off',
    'typescript/no-explicit-any': 'warn',
  },
})
