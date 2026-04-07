import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

/**
 * Creates a unique temp directory for test output.
 * Returns the path and a cleanup function.
 */
export async function createTmpDir(
  prefix = 'init-e2e-',
): Promise<{cleanup: () => Promise<void>; path: string}> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  return {
    cleanup: () => rm(path, {force: true, recursive: true}),
    path,
  }
}

/**
 * Reads an environment variable, returning undefined if not set.
 * Use this instead of readEnv() when the variable is optional (e.g. tests that skip without it).
 */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined
}

/**
 * Common base args for non-interactive init with the E2E project.
 * Always includes -y, --project, --dataset, --output-path.
 */
export function baseInitArgs(opts: {
  dataset?: string
  extraArgs?: string[]
  outputPath: string
  projectId: string
}): string[] {
  return [
    'init',
    '-y',
    '--project',
    opts.projectId,
    '--dataset',
    opts.dataset ?? 'production',
    '--output-path',
    opts.outputPath,
    ...(opts.extraArgs ?? []),
  ]
}
