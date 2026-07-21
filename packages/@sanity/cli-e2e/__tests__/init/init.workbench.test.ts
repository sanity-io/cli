import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EDataset, getE2EOrganizationId, getE2EProjectId, runCli} from '../../helpers/runCli.js'

const orgId = getE2EOrganizationId()
const projectId = getE2EProjectId()
const dataset = getE2EDataset()

// Workbench isn't on the published `latest` CLI yet, so skip against the registry.
const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'

// `--unstable--workbench` swaps the scaffolded `sanity.cli.ts` over to the
// `unstable_defineApp` variant (the sole federation opt-in). It applies to both
// the studio and SDK-app templates, which use different workbench config shapes.
describe.skipIf(isRegistryMode)('sanity init - workbench', {timeout: 120_000}, () => {
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
    // `slug` is pre-filled, defaulted from the name/title
    expect(cliConfig).toMatch(/slug: '[a-z0-9-]+'/)
  })

  test('scaffolds an SDK app whose sanity.cli.ts opts into workbench', async () => {
    const {error, exitCode} = await runCli({
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
        '--no-mcp',
        '--unstable--workbench',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)

    // The SDK app is scaffolded (App entry, no studio config)...
    expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)

    // ...and its CLI config is the workbench app variant: `unstable_defineApp`
    // with an `entry` (the navigable app view), branded with the org id.
    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('unstable_defineApp')
    expect(cliConfig).toContain('entry')
    expect(cliConfig).toContain(orgId)
    // `slug` is pre-filled, defaulted from the name/title
    expect(cliConfig).toMatch(/slug: '[a-z0-9-]+'/)
  })
})
