import {type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type UndeployAdapter, type UndeployOptions, type UndeployTarget} from '../types.js'
import {runUndeploy} from '../undeployRunner.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, confirm: vi.fn()}
})

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

const options = (output: Output, flags: Partial<UndeployOptions['flags']> = {}): UndeployOptions =>
  ({flags: {'dry-run': false, yes: false, ...flags}, output}) as UndeployOptions

function target(overrides: Partial<UndeployTarget> = {}): UndeployTarget {
  return {
    activeDeployment: null,
    appHost: 'my-studio',
    applicationId: 'app-1',
    applicationType: 'studio',
    createdAt: null,
    organizationId: null,
    projectId: 'project-1',
    title: null,
    url: 'https://my-studio.sanity.studio',
    ...overrides,
  }
}

function adapter(overrides: Partial<UndeployAdapter> = {}): UndeployAdapter {
  return {
    resolveTarget: async () => ({target: target(), type: 'found'}),
    type: 'studio',
    undeploy: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('runUndeploy dry run', () => {
  test('renders the plan and never deletes', async () => {
    const output = mockOutput()
    const undeploy = vi.fn()
    await runUndeploy(options(output, {'dry-run': true}), adapter({undeploy}))

    expect(undeploy).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Dry run — no changes made.'))
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('This studio can be undeployed.'),
    )
    expect(output.error).not.toHaveBeenCalled()
  })

  test('nothing to undeploy exits cleanly, like a real run', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {'dry-run': true}),
      adapter({resolveTarget: async () => ({message: 'No application ID provided', type: 'none'})}),
    )

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Nothing to undeploy.'))
    expect(output.error).not.toHaveBeenCalled()
  })

  test('a resolve failure blocks the plan and exits like a real run', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {'dry-run': true}),
      adapter({
        resolveTarget: async () => {
          throw new Error('network down')
        },
      }),
    )

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve undeploy target: network down'),
    )
    expect(output.error).toHaveBeenCalledWith('Undeploy blocked by failing checks.', {exit: 1})
  })
})

describe('runUndeploy real run', () => {
  test('confirms, deletes, and reports the scheduled undeploy', async () => {
    const output = mockOutput()
    const undeploy = vi.fn()
    vi.mocked(confirm).mockResolvedValueOnce(true)

    await runUndeploy(options(output), adapter({undeploy}))

    expect(undeploy).toHaveBeenCalledWith(expect.objectContaining({applicationId: 'app-1'}))
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Studio undeploy scheduled'))
  })

  test('a rejected confirmation deletes nothing', async () => {
    const output = mockOutput()
    const undeploy = vi.fn()
    vi.mocked(confirm).mockResolvedValueOnce(false)

    await runUndeploy(options(output), adapter({undeploy}))

    expect(undeploy).not.toHaveBeenCalled()
  })

  test('--yes skips the confirmation', async () => {
    const output = mockOutput()
    const undeploy = vi.fn()

    await runUndeploy(options(output, {yes: true}), adapter({undeploy}))

    expect(confirm).not.toHaveBeenCalled()
    expect(undeploy).toHaveBeenCalled()
  })

  test('nothing to undeploy prints the reason and never prompts', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output),
      adapter({
        resolveTarget: async () => ({
          message: 'No application ID provided',
          solution: 'Set `deployment.appId` in sanity.cli.js or sanity.cli.ts',
          type: 'none',
        }),
      }),
    )

    expect(confirm).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith('No application ID provided.')
    expect(output.log).toHaveBeenCalledWith('Nothing to undeploy.')
  })

  test('an application undeploy reports the appId cleanup reminder', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {yes: true}),
      adapter({
        resolveTarget: async () => ({
          target: target({applicationId: 'core-1', applicationType: 'coreApp', title: 'My App'}),
          type: 'found',
        }),
        type: 'coreApp',
      }),
    )

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Application undeploy scheduled'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('deployment.appId'))
  })

  test('a failed deletion surfaces the server message', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {yes: true}),
      adapter({
        undeploy: async () => {
          throw new Error('boom')
        },
      }),
    )

    expect(output.error).toHaveBeenCalledWith('Error undeploying studio: boom', {exit: 1})
  })

  test('Ctrl+C on the prompt reads as a cancellation, not an error dump', async () => {
    const output = mockOutput()
    vi.mocked(confirm).mockRejectedValueOnce(
      Object.assign(new Error('User force closed'), {name: 'ExitPromptError'}),
    )

    await runUndeploy(options(output), adapter())

    expect(output.error).toHaveBeenCalledWith('Undeploy cancelled by user', {exit: 1})
  })
})
