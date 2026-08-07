import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    coverage: {
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps oclif test helpers
    env: {
      // Fix EMFILE errors on macOS
      ...(process.platform === 'darwin' ? {CHOKIDAR_USEPOLLING: '1'} : {}),
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
