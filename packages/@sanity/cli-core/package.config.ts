import baseConfig from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  ...baseConfig,
  deps: {neverBundle: ['sanity']},
  tsdoc: {
    ...baseConfig.tsdoc,
    // Disable rules for now
    rules: {
      'ae-internal-missing-underscore': 'off',
      'ae-missing-release-tag': 'off',
    },
  },
})
