import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      '~test/helpers': new URL('test/helpers', import.meta.url).pathname,
    },
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps @oclif/test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    globals: false,
    globalSetup: ['test/globalSetup.ts', 'test/workerBuild.ts'],
    setupFiles: ['test/setup.ts'],
  },
})
