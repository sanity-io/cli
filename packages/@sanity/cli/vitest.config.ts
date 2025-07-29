import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      '@sanity/cli-core': new URL('node_modules/@sanity/cli-core/src/index.ts', import.meta.url)
        .pathname,
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
    globalSetup: ['test/workerBuild.ts', 'test/testFixtures.ts'],
    setupFiles: ['test/setup.ts'],
  },
})
