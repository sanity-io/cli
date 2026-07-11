/**
 * Standalone script to pre-build all worker files in the monorepo.
 *
 * Run from the repository root via:
 *   pnpm build:workers
 *
 * This is used by the CI `build-workers` job to compile workers once and share
 * the output across all integration-test shards via GitHub Actions artifacts.
 */
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {glob} from 'tinyglobby'

import {buildWorkerFiles} from '../src/vitestWorker.js'

// Resolve the monorepo root from this script's location:
// scripts/ -> @sanity/cli-test/ -> @sanity/ -> packages/ -> repo root
const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../..')

const workerFiles = await glob('packages/**/*.worker.ts', {
  cwd: repoRoot,
  absolute: true,
  ignore: ['**/node_modules/**', '**/dist/**'],
})

await buildWorkerFiles(workerFiles)
