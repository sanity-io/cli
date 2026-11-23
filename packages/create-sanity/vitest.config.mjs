// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test.js', '*.test.js'],
    setupFiles: ['../../test/vitest/setup.ts'],
  },
})
