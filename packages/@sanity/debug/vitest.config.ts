import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/dist/**', '**/__tests__/**', '**/*.{test,spec}.{js,ts}'],
      provider: 'istanbul',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
  },
})
