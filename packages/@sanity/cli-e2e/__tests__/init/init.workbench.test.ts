import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EDataset, getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()
const dataset = getE2EDataset()

// The `--unstable--workbench` flag scaffolds a studio whose `sanity.cli.ts` opts
// into workbench via `unstable_defineApp` (the sole federation opt-in). The org
// id is derived from the selected project, so no `--organization` is needed.
describe('sanity init - workbench studio', {timeout: 120_000}, () => {
  let tmp: Awaited<ReturnType<typeof createTmpDir>>

  beforeEach(async () => {
    tmp = await createTmpDir({useSystemTmp: true})
  })

  afterEach(async () => {
    await tmp.cleanup()
  })

  test('scaffolds a studio whose sanity.cli.ts opts into workbench', async () => {
    const {error, exitCode} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        dataset,
        '--output-path',
        tmp.path,
        '--typescript',
        '--package-manager',
        'pnpm',
        '--no-git',
        '--no-mcp',
        '--unstable--workbench',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)

    // Studio files are scaffolded as usual...
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)

    // ...but the CLI config is the workbench (`unstable_defineApp`) variant,
    // branded with the project's org id.
    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('unstable_defineApp')
    expect(cliConfig).toContain(projectId)
    expect(cliConfig).toContain('organizationId')
  })
})
