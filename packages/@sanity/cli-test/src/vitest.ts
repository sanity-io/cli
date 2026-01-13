/**
 * Vitest global setup entry point.
 *
 * Import this in your vitest.config.ts globalSetup array for automatic
 * test example setup and teardown.
 *
 * @example
 * ```typescript
 * // vitest.config.ts
 * import {defineConfig} from 'vitest/config'
 *
 * export default defineConfig({
 *   test: {
 *     globalSetup: ['@sanity/cli-test/vitest']
 *   }
 * })
 * ```
 */
export {setup, teardown} from './test/setupExamples.js'
export {setupWorkerBuild, teardownWorkerBuild} from './vitestWorker.js'
