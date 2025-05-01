import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    disableConsoleIntercept: true, // helps @oclif/test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    globals: false,
    setupFiles: ['test/setup.ts'],
  },
})
