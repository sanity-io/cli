import {readdir} from 'node:fs/promises'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

describe('sanity init --bare', () => {
  let tmp: Awaited<ReturnType<typeof createTmpDir>>

  beforeEach(async () => {
    tmp = await createTmpDir({useSystemTmp: true})
  })

  afterEach(async () => {
    await tmp.cleanup()
  })

  test('outputs project info without creating any files', async () => {
    const {error, exitCode, stdout} = await runCli({
      args: ['init', '-y', '--bare', '--project', projectId, '--dataset', 'production'],
      cwd: tmp.path,
    })

    if (error) throw error
    expect(exitCode).toBe(0)

    expect(stdout).toContain('Project ID:')
    expect(stdout).toContain(projectId)
    expect(stdout).toContain('Dataset:')
    expect(stdout).toContain('production')
    expect(stdout).toContain(`sanity.io/manage/project/${projectId}`)

    const entries = await readdir(tmp.path)
    expect(entries).toEqual([])
  })

  test.skip('fails with non-existent project', async () => {
    const {exitCode, stderr} = await runCli({
      args: [
        'init',
        '-y',
        '--bare',
        '--project',
        'nonexistent-project-id',
        '--dataset',
        'production',
      ],
      cwd: tmp.path,
    })

    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/not found|does not exist|unauthorized/i)
  })
})
