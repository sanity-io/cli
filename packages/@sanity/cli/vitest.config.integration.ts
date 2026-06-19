import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    name: '@sanity/cli/integration',
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globals: false,
    globalSetup: ['test/workerBuild.ts', '@sanity/cli-test/vitest'],
    setupFiles: ['test/setup.ts'],
    snapshotSerializers: ['test/snapshotSerializer.ts'],
  },
})
