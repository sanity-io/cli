import {setupWorkerBuild, teardownWorkerBuild} from '@sanity/cli-test/vitest'
import {glob} from 'tinyglobby'
import {type TestProject} from 'vitest/node'

export async function setup(project: TestProject) {
  // Find all .worker.ts files in both CLI and CLI-core packages
  const workerFiles = await glob('**/*.worker.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  // Also find worker files in cli-core package (relative to CLI package)
  const cliCoreWorkerFiles = await glob('../cli-core/src/**/*.worker.ts', {
    cwd: process.cwd(),
  })

  const allWorkerFiles = [...workerFiles, ...cliCoreWorkerFiles]
  return setupWorkerBuild(project, allWorkerFiles)
}

export async function teardown() {
  return teardownWorkerBuild()
}
