import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EDataset, getE2EOrganizationId, getE2EProjectId, runCli} from '../../helpers/runCli.js'

const orgId = getE2EOrganizationId()
const projectId = getE2EProjectId()
const dataset = getE2EDataset()

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

  test('complete interactive flow selects project and dataset', async () => {
    const session = await runCli({
      args: [
        'init',
        '--template',
        'app-quickstart',
        '--organization',
        orgId,
        '--output-path',
        tmp.path,
        '--no-git',
        '--no-mcp',
      ],
      interactive: true,
    })

    await session.waitForText(/Configure a project for this app/i)
    await session.selectOption(new RegExp(`\\(${projectId}\\)`))

    await session.waitForText(/Select dataset to use/i)
    await session.selectOption(dataset)

    await session.waitForText(/Package manager to use/i)
    await session.selectOption('pnpm')

    const exitCode = await session.waitForExit(90_000)
    expect(exitCode).toBe(0)

    expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)

    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('organizationId')

    const output = session.getOutput()
    expect(output).toContain('Your custom app has been scaffolded')
    expect(output).toMatch(/Configured with project .+ and dataset/)
  })
})
