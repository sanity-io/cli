import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/dist/**',
        '**/tmp/**',
        '**/test/**',
        '**/__tests__/**',
        '**/*.{test,spec}.{js,ts}',
      ],
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps @oclif/test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
  },
})
