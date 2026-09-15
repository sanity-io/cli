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
    include: [
      'test/integration/**/*.test.ts',
      'src/actions/build/vite/build-federated-app.test.ts',
    ],
    name: '@sanity/workbench-cli/integration',
    setupFiles: ['../../../test/vitest/setup.ts'],
  },
})
