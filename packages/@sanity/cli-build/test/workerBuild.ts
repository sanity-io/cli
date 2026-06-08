import {setupWorkerBuild, teardownWorkerBuild} from '@sanity/cli-test/vitest'
import {glob} from 'tinyglobby'

export async function setup() {
  // Find all .worker.ts files in both CLI and CLI-core packages
  const workerFiles = await glob('**/*.worker.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  return setupWorkerBuild(workerFiles)
}

export async function teardown() {
  return teardownWorkerBuild()
}
