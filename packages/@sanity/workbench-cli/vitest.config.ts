import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
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
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'test/integration/**'],
    globals: false,
    name: '@sanity/workbench-cli/unit',
  },
})
