import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/dist/**', '**/test/**', '**/*.{test,spec}.{js,ts}'],
      provider: 'istanbul',
    },
    disableConsoleIntercept: true, // tests spawn subprocesses that write to stdout/stderr
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
  },
})
