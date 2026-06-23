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
    environment: 'node',
    // `*.unit.test.*` files run in the root `unit` project; exclude them here so
    // they don't also run in this package project (matches @sanity/cli).
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.unit.test.{ts,tsx}'],
    globals: false,
    name: '@sanity/workbench-cli/unit',
  },
})
