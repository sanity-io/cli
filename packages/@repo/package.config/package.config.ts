import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  strictOptions: {
    noImplicitBrowsersList: 'off',
    noImplicitSideEffects: 'error',
    noPublishConfigExports: 'error',
  },
  tsconfig: 'tsconfig.lib.json',
  tsdoc: {
    rules: {
      // Rules to disable
      'ae-internal-missing-underscore': 'off',
    },
  },
})
