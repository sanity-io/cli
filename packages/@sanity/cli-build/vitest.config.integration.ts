import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli-build',
    },
    environment: 'node',
    globals: false,
    globalSetup: ['../cli/test/workerBuild.ts', '@sanity/cli-test/vitest'],
    include: ['test/integration/**/*.test.ts'],
    name: '@sanity/cli-build/integration',
    setupFiles: ['../cli/test/setup.ts'],
    snapshotSerializers: ['../cli/test/snapshotSerializer.ts'],
  },
})
