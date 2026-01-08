import tsconfigPaths from 'vite-tsconfig-paths'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      exclude: [
        '**/dist/**',
        '**/tmp/**',
        '**/test/**',
        '**/__tests__/**',
        '**/*.{test,spec}.{js,ts}',
      ],
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // helps @oclif/test helpers
    env: {
      OCLIF_TEST_ROOT: 'packages/@sanity/cli',
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
    globalSetup: ['test/workerBuild.ts', 'test/testFixtures.ts'],
    setupFiles: ['test/setup.ts'],
  },
})
