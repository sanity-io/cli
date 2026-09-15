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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'test/integration/**',
      'src/actions/build/vite/build-federated-app.test.ts',
    ],
    globals: false,
    name: '@sanity/workbench-cli/unit',
    setupFiles: ['../../../test/vitest/setup.ts'],
  },
})
