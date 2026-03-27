import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['e2e/global-setup.ts'],
    include: ['e2e/tests/**/*.test.ts'],
    // Real resources are created/deleted — run tests sequentially
    pool: 'forks',
    poolOptions: {
      forks: {singleFork: true},
    },
    testTimeout: 60_000,
  },
})
