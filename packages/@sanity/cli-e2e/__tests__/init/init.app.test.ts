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

  describe.each([
    {label: 'with -y flag', yFlag: ['-y']},
    {label: 'unattended (no -y)', yFlag: [] as string[]},
  ])('non-interactive ($label)', ({yFlag}) => {
    test('creates app with app-quickstart template', async () => {
      const {error, exitCode, stdout} = await runCli({
        args: [
          'init',
          ...yFlag,
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

  test('shows project configuration prompt and completes when skipped', async () => {
    const session = await runCli({
      args: [
        'init',
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
        '--no-mcp',
      ],
      interactive: true,
    })

    await session.waitForText(/Configure a project for this app/i)
    session.sendKey('Enter')

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)

    const output = session.getOutput()
    expect(output).toMatch(/Success/i)
    expect(output).toMatch(/configure the project/i)
  })
})
