import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    globals: false,
    globalSetup: ['test/workerBuild.ts', '@sanity/cli-test/vitest'],
    include: ['test/integration/**/*.test.ts'],
    name: '@sanity/cli/integration',
    setupFiles: ['test/setup.ts'],
    snapshotSerializers: ['test/snapshotSerializer.ts'],
  },
})
