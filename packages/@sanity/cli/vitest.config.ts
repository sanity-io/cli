import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'test/integration/**'],
    globals: false,
    name: '@sanity/cli/unit',
  },
})
