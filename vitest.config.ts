import {createHash} from 'node:crypto'

import {determineAgent} from '@vercel/detect-agent'
import {defineConfig} from 'vitest/config'

const {isAgent: IS_AGENT} = await determineAgent()
const cwdHash = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 8)
const OUTPUT_FILE = IS_AGENT ? {json: `/tmp/test-results-${cwdHash}.json`} : undefined

export default defineConfig({
  // This is needed to avoid listening to changes in the tmp directory
  // Without this, watch will go in an infinite loop
  server: {
    watch: {
      ignored: ['**/tmp/**/*'],
    },
  },
  test: {
    coverage: {
      exclude: [
        '**/*.{test,spec,stories,d}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'fixtures/**',
        'packages/@sanity/cli/test/**',
        'packages/@sanity/cli/templates/**',
        // Vitest 4.0 no longer auto-excludes these directories
        '**/dist/**',
        '**/tmp/**',
        '**/test/**',
        '**/__tests__/**',
        '**/coverage/**',
        '**/.git/**',
      ],
      include: [
        'packages/@sanity/cli/**/*.{ts,tsx}',
        'packages/@sanity/cli-build/**/*.{ts,tsx}',
        'packages/@sanity/cli-core/**/*.{ts,tsx}',
        'packages/create-sanity/**/*.{ts,tsx}',
      ],
      provider: 'istanbul',
      reporter: ['html', 'json', 'json-summary'],
    },
    // Add explicit exclude for test execution
    exclude: ['**/node_modules/**', '**/dist/**', '**/tmp/**', '**/.git/**'],
    outputFile: OUTPUT_FILE,
    // Use threads pool (worker_threads) instead of the default forks pool
    // (child_process.fork). The forks pool has race conditions during process
    // cleanup on Windows + Node 20 that cause spurious "Worker forks emitted
    // error" failures.
    pool: 'threads',
    projects: [
      'packages/@sanity/cli',
      'packages/@sanity/cli-build',
      'packages/@sanity/cli-core',
      'packages/create-sanity',
    ],
    reporters: ['default', ...(IS_AGENT ? ['json'] : [])],
  },
})
