import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  extract: {
    // We already check types with `check:types` scripts
    checkTypes: false,
    rules: {
      // Disable rules for now
      'ae-internal-missing-underscore': 'off',
    },
  },
  strictOptions: {
    noImplicitBrowsersList: 'off',
    noImplicitSideEffects: 'error',
    noPublishConfigExports: 'error',
  },
  tsconfig: 'tsconfig.lib.json',
})
