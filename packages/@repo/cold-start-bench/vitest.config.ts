import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    name: '@repo/cold-start-bench/unit',
    setupFiles: ['../../../test/vitest/setup.ts'],
  },
})
