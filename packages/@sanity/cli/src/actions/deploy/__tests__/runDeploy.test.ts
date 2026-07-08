import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {
  type DeployAdapter,
  type DeployAppOptions,
  type DeployCheck,
  type DeploymentFile,
  type DeploymentPlan,
  newPlan,
} from '@sanity/cli-core/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {deploymentPlanToJson, renderDeploymentPlan, runDeploy} from '../runDeploy.js'

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

/** A stub studio adapter whose slots report nothing and upload nothing. */
const studioAdapter = (
  overrides: Partial<DeployAdapter<'studio'>> = {},
): DeployAdapter<'studio'> => ({
  acquireTarget: async (_options, state) => state,
  check: async () => ({checks: [], state: {uploadsFiles: false, version: '3.99.0'}}),
  checkOutput: async (_options, state) => ({checks: [], state}),
  deploy: async () => undefined,
  describeTarget: async () => null,
  type: 'studio',
  ...overrides,
})

describe('runDeploy dry run', () => {
  test('exits with the first failing check exit code, like a real deploy', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      check: async () => ({
        checks: [{exitCode: 2, message: 'boom', status: 'fail'}],
        state: {uploadsFiles: false, version: null},
      }),
    })

    await runDeploy(dryRunOptions(output), adapter)

    expect(output.error).toHaveBeenCalledWith('Deploy blocked by failing checks.', {exit: 2})
  })

  test('a deployable dry run renders the plan without erroring', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      check: async () => ({
        checks: [{message: 'Project: p1', status: 'pass'}],
        state: {uploadsFiles: false, version: '3.99.0'},
      }),
    })

    await runDeploy(dryRunOptions(output), adapter)

    expect(output.error).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('This studio can be deployed.'))
  })

  test('the JSON plan reports the version the checks resolved', async () => {
    const output = mockOutput()
    const adapter = studioAdapter({
      check: async () => ({
        checks: [{message: 'Using sanity 9.9.9', status: 'pass'}],
        state: {uploadsFiles: false, version: '9.9.9'},
      }),
    })

    await runDeploy(
      {...dryRunOptions(output), flags: {'dry-run': true, json: true}} as DeployAppOptions,
      adapter,
    )

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload.applicationVersion).toBe('9.9.9')
  })

  test('never acquires a target or deploys', async () => {
    const output = mockOutput()
    const acquireTarget = vi.fn()
    const deploy = vi.fn()
    const adapter = studioAdapter({acquireTarget, deploy})

    await runDeploy(dryRunOptions(output), adapter)

    expect(acquireTarget).not.toHaveBeenCalled()
    expect(deploy).not.toHaveBeenCalled()
  })

  test('a blocked --json dry run prints the plan only, never a deploy envelope', async () => {
    const output = mockOutput()
    // A real run's output.error throws to abort; the plan JSON is already out.
    vi.mocked(output.error).mockImplementation(() => {
      throw new CLIError('blocked')
    })
    const adapter = studioAdapter({
      check: async () => ({
        checks: [{exitCode: 2, message: 'boom', status: 'fail'}],
        state: {uploadsFiles: false, version: null},
      }),
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
  test('runs the slots in order and emits the deploy result as JSON, marked deployed', async () => {
    const output = mockOutput()
    const order: string[] = []
    const result = {
      applicationType: 'studio' as const,
      applicationVersion: '3.99.0',
      target: {applicationId: 'app-1', title: 'My Studio', url: 'https://my-studio.sanity.studio'},
    }
    const adapter = studioAdapter({
      acquireTarget: async (_options, state) => {
        order.push('acquire')
        return state
      },
      check: async () => {
        order.push('check')
        return {checks: [], state: {uploadsFiles: false, version: '3.99.0'}}
      },
      checkOutput: async (_options, state) => {
        order.push('output')
        return {checks: [], state}
      },
      deploy: async () => {
        order.push('deploy')
        return result
      },
    })

    await runDeploy({...dryRunOptions(output), flags: {json: true}} as DeployAppOptions, adapter)

    expect(order).toEqual(['check', 'acquire', 'output', 'deploy'])
    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload).toEqual({deployed: true, ...result})
  })

  test('a failing check aborts before the target is acquired', async () => {
    const output = mockOutput()
    vi.mocked(output.error).mockImplementation(() => {
      throw new CLIError('boom')
    })
    const acquireTarget = vi.fn()
    const adapter = studioAdapter({
      acquireTarget,
      check: async () => ({
        checks: [{message: 'boom', status: 'fail'}],
        state: {uploadsFiles: false, version: null},
      }),
    })

    // The mocked output.error throws on the catch-path re-report too, so the run rejects.
    await expect(
      runDeploy({...dryRunOptions(output), flags: {}} as DeployAppOptions, adapter),
    ).rejects.toThrow('boom')

    expect(acquireTarget).not.toHaveBeenCalled()
    expect(output.error).toHaveBeenCalledWith('boom', {exit: 1})
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
