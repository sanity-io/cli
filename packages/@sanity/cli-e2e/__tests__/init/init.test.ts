import {readdir} from 'node:fs/promises'

import {createTmpDir} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

describe('sanity init - error handling', () => {
  test('rejects invalid input with helpful error', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['init', '--reconfigure'],
      env: {SANITY_AUTH_TOKEN: ''},
    })
    expect(exitCode).not.toBe(0)
    expect(stderr.length).toBeGreaterThan(0)
  })
})

describe('sanity init --bare', () => {
  test('outputs project info without creating any files', async () => {
    const tmp = await createTmpDir({useSystemTmp: true})
    try {
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
    } finally {
      await tmp.cleanup()
    }
  })
})
