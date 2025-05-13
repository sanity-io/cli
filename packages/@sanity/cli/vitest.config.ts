import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      '~test/helpers': new URL('test/helpers', import.meta.url).pathname,
    },
    disableConsoleIntercept: true, // helps @oclif/test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    globals: false,
    setupFiles: ['test/setup.ts'],
  },
})
