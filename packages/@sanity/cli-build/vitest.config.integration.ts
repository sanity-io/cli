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
    globalSetup: ['test/workerBuild.ts', '@sanity/cli-test/vitest'],
    include: ['test/integration/**/*.test.ts'],
    name: '@sanity/cli-build/integration',
    setupFiles: ['test/setup.ts'],
    snapshotSerializers: ['test/snapshotSerializer.ts'],
  },
})
