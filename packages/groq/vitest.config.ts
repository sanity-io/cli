import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/coverage/**', '**/node_modules/**', '**/test/**', '**/*.d.{ts,cts}'],
      include: ['groq.js'],
      provider: 'istanbul',
    },
    environment: 'node',
    globals: false,
    include: ['test/groq.test.ts'],
    name: 'groq/unit',
  },
})
