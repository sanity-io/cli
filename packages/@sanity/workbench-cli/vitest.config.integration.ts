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
    globals: false,
    include: ['test/integration/**/*.test.ts'],
    name: '@sanity/workbench-cli/integration',
  },
})
