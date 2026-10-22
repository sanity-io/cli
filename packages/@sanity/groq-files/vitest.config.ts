import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/dist/**',
        '**/tmp/**',
        '**/.tmp/**',
        '**/test/**',
        '**/__tests__/**',
        '**/*.{test,spec}.{js,ts}',
      ],
      provider: 'istanbul',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    name: '@sanity/groq-files/unit',
    setupFiles: ['../../../test/vitest/setup.ts'],
  },
})
