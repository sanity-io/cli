import {defineConfig} from 'vitest/config'

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/tmp/**/*'],
    },
  },
  test: {
    disableConsoleIntercept: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Run tests sequentially — PTY-backed tests are resource-intensive
    fileParallelism: false,
    globals: false,
    // 1. Pack @sanity/cli into a tarball and extract to tmp/ for realistic E2E testing
    // 2. Initialize test fixtures (copies fixtures, installs deps)
    globalSetup: ['./globalSetup.ts', '@sanity/cli-test/vitest'],
    hookTimeout: 120_000,
    // E2E tests spawn real processes and need longer timeouts
    testTimeout: 30_000,
  },
})
