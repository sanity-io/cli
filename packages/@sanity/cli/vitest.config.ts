import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
    globalSetup: ['test/workerBuild.ts', '@sanity/cli-test/vitest'],
    setupFiles: ['test/setup.ts'],
    snapshotSerializers: ['test/snapshotSerializer.ts'],
  },
})
