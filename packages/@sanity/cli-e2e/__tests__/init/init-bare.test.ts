import {readdir} from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'
import {createTmpDir, optionalEnv} from './helpers.js'

const hasToken = Boolean(optionalEnv('SANITY_E2E_TOKEN'))
const projectId = hasToken ? getE2EProjectId() : 'skip'

describe.skipIf(!hasToken)('sanity init --bare', () => {
  let tmpDir: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    tmpDir = tmp.path
    cleanup = tmp.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  test('3.1 outputs project ID, dataset, and manage URL', async () => {
    const {error, exitCode, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--bare',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmpDir,
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Project ID:')
    expect(stdout).toContain(projectId)
    expect(stdout).toContain('Dataset:')
    expect(stdout).toContain('production')
    expect(stdout).toContain(`sanity.io/manage/project/${projectId}`)
  })

  test('3.3 does not create any files', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--bare',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmpDir,
      ],
      cwd: tmpDir,
    })

    if (error) throw error

    const entries = await readdir(tmpDir)
    expect(entries).toEqual([])
  })

  test('3.4 --dataset-default uses production dataset', async () => {
    const {error, exitCode, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--bare',
        '--project',
        projectId,
        '--dataset-default',
        '--output-path',
        tmpDir,
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Dataset:')
    expect(stdout).toContain('production')
  })
})
