import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    name: 'create-sanity/unit',
    setupFiles: ['../../test/vitest/setup.ts'],
  },
})
