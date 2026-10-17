import {setupWorkerBuild, teardownWorkerBuild} from '@sanity/cli-test/vitest'
import {glob} from 'tinyglobby'

export async function setup() {
  // Find all .worker.ts files in the CLI packages, plus the files they load at runtime by URL:
  // the module hooks the studio worker registers, and the manifest icon resolver
  const workerFiles = await glob(
    ['**/*.worker.ts', '**/*.hooks.ts', '**/manifest/iconResolver.tsx'],
    {
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/dist/**'],
    },
  )

  return setupWorkerBuild(workerFiles)
}

export async function teardown() {
  return teardownWorkerBuild()
}
