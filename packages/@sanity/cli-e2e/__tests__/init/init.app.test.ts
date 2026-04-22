import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EOrganizationId, runCli} from '../../helpers/runCli.js'

const orgId = getE2EOrganizationId()

describe('sanity init - app', {timeout: 120_000}, () => {
  let tmp: Awaited<ReturnType<typeof createTmpDir>>

  beforeEach(async () => {
    tmp = await createTmpDir({useSystemTmp: true})
  })

  afterEach(async () => {
    await tmp.cleanup()
  })

  test('creates app with app-quickstart template', async () => {
    const {error, exitCode, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--template',
        'app-quickstart',
        '--organization',
        orgId,
        '--output-path',
        tmp.path,
        '--typescript',
        '--package-manager',
        'pnpm',
        '--no-git',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)

    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('organizationId')
    expect(cliConfig).toContain('entry')

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)

    expect(stdout).toMatch(/app has been scaffolded|Success/i)
  })
})
