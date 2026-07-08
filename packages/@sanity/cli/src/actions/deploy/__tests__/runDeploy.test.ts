import {type Dirent, type Stats} from 'node:fs'
import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type DeployCheck} from '../checks.js'
import {
  type DeployAdapter,
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  listDeploymentFiles,
  newPlan,
  renderDeploymentPlan,
  runDeploy,
} from '../runDeploy.js'
import {type DeployAppOptions} from '../types.js'

vi.mock(import('node:fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

const mockReaddir = vi.mocked(readdir)
const mockStat = vi.mocked(stat)

// Minimal Dirent stand-in: listDeploymentFiles only reads `name` and `isDirectory()`.
const dirent = (name: string, isDirectory: boolean): Dirent =>
  ({isDirectory: () => isDirectory, name}) as Dirent

describe('listDeploymentFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists nested files as sorted paths with sizes, relative to fromDir', async () => {
    mockReaddir.mockImplementation((async (dir: string) => {
      if (dir.endsWith(join('dist', 'assets'))) return [dirent('app.js', false)]
      if (dir.endsWith('dist')) return [dirent('index.html', false), dirent('assets', true)]
      return []
    }) as unknown as typeof readdir)
    mockStat.mockImplementation(
      (async (file: string) =>
        ({size: file.endsWith('app.js') ? 3 : 1}) as Stats) as unknown as typeof stat,
    )

    const files = await listDeploymentFiles(join('/root', 'dist'), '/root')

    expect(files).toEqual([
      {path: 'dist/assets/app.js', size: 3},
      {path: 'dist/index.html', size: 1},
    ])
  })

  test('returns an empty list when the directory is missing', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'))
    expect(await listDeploymentFiles(join('/root', 'missing'), '/root')).toEqual([])
  })
})

const studioPlan = (
  checks: DeployCheck[],
  files: DeploymentFile[] = [],
): DeploymentPlan<'studio'> =>
  newPlan({checks, files, target: null, type: 'studio', version: '3.99.0'})

describe('deploymentPlanToJson', () => {
  test('maps failing checks to fixes and warnings to messages, dropping pass/skip', () => {
    const json = deploymentPlanToJson(
      studioPlan(
        [
          {message: 'Project: p1', status: 'pass'},
          {message: 'No studio hostname configured', solution: 'Set `studioHost`', status: 'fail'},
          {message: 'The autoUpdates config has moved', status: 'warn'},
        ],
        [{path: 'dist/index.html', size: 1_048_576}],
      ),
    )

    // No `exposes`/`installationConfig` keys — a plain (non-workbench) plan omits them.
    expect(json).toEqual({
      applicationType: 'studio',
      applicationVersion: '3.99.0',
      errors: {'No studio hostname configured': 'Set `studioHost`'},
      files: [{path: 'dist/index.html', size: 1_048_576}],
      isDeployable: false,
      target: null,
      totalBytes: 1_048_576,
      warnings: ['The autoUpdates config has moved'],
    })
  })

  test('passes the resolved target through to the JSON', () => {
    const target = {
      applicationId: 'app-1',
      title: 'My Studio',
      url: 'https://my-studio.sanity.studio',
    }
    const json = deploymentPlanToJson(newPlan({checks: [], target, type: 'studio', version: null}))
    expect(json.target).toEqual(target)
  })

  test('an error without a solution maps to null', () => {
    const json = deploymentPlanToJson(studioPlan([{message: 'boom', status: 'fail'}]))
    expect(json.errors).toEqual({boom: null})
    expect(json.isDeployable).toBe(false)
  })

  test('isDeployable is true when no check failed', () => {
    expect(deploymentPlanToJson(studioPlan([{message: 'ok', status: 'pass'}])).isDeployable).toBe(
      true,
    )
  })

  test('surfaces the registered exposes and installation-config summary', () => {
    const plan = studioPlan([{message: 'ok', status: 'pass'}])
    plan.exposes = [{name: 'edit', title: 'Edit', type: 'panel'}]
    plan.installationConfig = 'Media Library fields:\n  Title (title)'

    const json = deploymentPlanToJson(plan)

    expect(json.exposes).toEqual([{name: 'edit', title: 'Edit', type: 'panel'}])
    expect(json.installationConfig).toBe('Media Library fields:\n  Title (title)')
  })
})

describe('renderDeploymentPlan', () => {
  const lines: string[] = []
  const output = {log: (message: string) => lines.push(message)} as unknown as Output

  beforeEach(() => {
    lines.length = 0
  })

  test('reports a deployable studio with its files and sizes', () => {
    renderDeploymentPlan(
      studioPlan(
        [{message: 'Project: p1', status: 'pass'}],
        [{path: 'dist/index.html', size: 1_572_864}],
      ),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain('Dry run — no changes made.')
    expect(text).toContain('Project: p1')
    expect(text).toContain('This studio can be deployed.')
    expect(text).toContain('Files to deploy (1 file, 1.50 MB):')
    expect(text).toContain('dist/index.html (1.50 MB)')
  })

  test('lists problems with their solutions when a check failed', () => {
    renderDeploymentPlan(
      studioPlan([
        {message: 'No project ID configured', solution: 'Add `api.projectId`', status: 'fail'},
      ]),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain("This studio can't be deployed.")
    expect(text).toContain('Problems to fix:')
    expect(text).toContain('No project ID configured: Add `api.projectId`')
    // No files to list, so the section is omitted rather than shown as "0.00 MB"
    expect(text).not.toContain('Files to deploy')
  })

  test('omits the files section for a blocked plan even when files are present', () => {
    renderDeploymentPlan(
      studioPlan(
        [{message: 'No project ID configured', status: 'fail'}],
        [{path: 'dist/index.html', size: 1_048_576}],
      ),
      output,
    )

    expect(lines.join('\n')).not.toContain('Files to deploy')
  })

  test('surfaces warnings in their own section', () => {
    renderDeploymentPlan(
      studioPlan([
        {message: 'Project: p1', status: 'pass'},
        {message: 'The `autoUpdates` config has moved', solution: 'Move it', status: 'warn'},
      ]),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain('This studio can be deployed.')
    expect(text).toContain('Warnings:')
    expect(text).toContain('The `autoUpdates` config has moved: Move it')
  })

  test('labels a core app deploy as an application', () => {
    renderDeploymentPlan(
      newPlan({checks: [], target: null, type: 'coreApp', version: '1.0.0'}),
      output,
    )

    expect(lines.join('\n')).toContain('This application can be deployed.')
  })
})

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

const dryRunOptions = (output: Output): DeployAppOptions =>
  ({
    cliConfig: {},
    flags: {'dry-run': true},
    output,
    projectRoot: {directory: '/root', path: '/root/sanity.cli.ts'},
    sourceDir: '/root/dist',
  }) as unknown as DeployAppOptions

const studioAdapter = (
  overrides: Partial<DeployAdapter<'studio'>> = {},
): DeployAdapter<'studio'> => ({
  deploy: async () => undefined,
  plan: async () => newPlan({checks: [], target: null, type: 'studio', version: null}),
  type: 'studio',
  ...overrides,
})

describe('runDeploy dry run', () => {
  test('exits with the first failing check exit code, like a real deploy', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      plan: async () => studioPlan([{exitCode: 2, message: 'boom', status: 'fail'}]),
    })

    await runDeploy(dryRunOptions(output), adapter)

    expect(output.error).toHaveBeenCalledWith('Deploy blocked by failing checks.', {exit: 2})
  })

  test('a deployable dry run renders the plan without erroring', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      plan: async () =>
        studioPlan(
          [{message: 'Project: p1', status: 'pass'}],
          [{path: 'dist/index.html', size: 10}],
        ),
    })

    await runDeploy(dryRunOptions(output), adapter)

    expect(output.error).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('This studio can be deployed.'))
  })

  test('the JSON plan reports the version the plan resolved', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      plan: async () =>
        newPlan({
          checks: [{message: 'Using sanity 9.9.9', status: 'pass'}],
          target: null,
          type: 'studio',
          version: '9.9.9',
        }),
    })

    await runDeploy(
      {...dryRunOptions(output), flags: {'dry-run': true, json: true}} as DeployAppOptions,
      adapter,
    )

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload.applicationVersion).toBe('9.9.9')
  })

  test('never calls deploy', async () => {
    const output = mockOutput()
    const deploy = vi.fn()
    const adapter = studioAdapter({deploy})

    await runDeploy(dryRunOptions(output), adapter)

    expect(deploy).not.toHaveBeenCalled()
  })

  test('a blocked --json dry run prints the plan only, never a deploy envelope', async () => {
    const output = mockOutput()
    // A real run's output.error throws to abort; the plan JSON is already out.
    vi.mocked(output.error).mockImplementation(() => {
      throw new CLIError('blocked')
    })
    const adapter = studioAdapter({
      plan: async () => studioPlan([{exitCode: 2, message: 'boom', status: 'fail'}]),
    })

    await expect(
      runDeploy(
        {...dryRunOptions(output), flags: {'dry-run': true, json: true}} as DeployAppOptions,
        adapter,
      ),
    ).rejects.toThrow()

    const logged = vi.mocked(output.log).mock.calls.map((call) => call[0] as string)
    expect(logged).toHaveLength(1)
    expect(logged[0]).not.toContain('"deployed"')
  })
})

describe('runDeploy real deploy', () => {
  test('emits the deploy result as JSON, marked deployed', async () => {
    const output = mockOutput()
    const result = {
      applicationType: 'studio' as const,
      applicationVersion: '3.99.0',
      target: {applicationId: 'app-1', title: 'My Studio', url: 'https://my-studio.sanity.studio'},
    }
    const adapter = studioAdapter({deploy: async () => result})

    await runDeploy({...dryRunOptions(output), flags: {json: true}} as DeployAppOptions, adapter)

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload).toEqual({deployed: true, ...result})
  })

  test('a failed deploy emits a {deployed: false} envelope and still errors on stderr', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      deploy: async () => {
        throw new Error('boom')
      },
    })

    await runDeploy({...dryRunOptions(output), flags: {json: true}} as DeployAppOptions, adapter)

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload.deployed).toBe(false)
    expect(payload.error.message).toContain('boom')
    // The envelope and the stderr message are the same diagnosis
    expect(output.error).toHaveBeenCalledWith(payload.error.message, {exit: 1})
  })

  test('without --json a failed deploy stays on stderr, with no envelope', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      deploy: async () => {
        throw new Error('boom')
      },
    })

    await runDeploy({...dryRunOptions(output), flags: {}} as DeployAppOptions, adapter)

    expect(output.log).not.toHaveBeenCalled()
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('boom'), {exit: 1})
  })
})
