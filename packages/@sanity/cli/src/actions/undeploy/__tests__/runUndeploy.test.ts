import {type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-test/mocks/cli-core/ux'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {runUndeploy, type UndeployAdapter, type UndeployOptions} from '../runUndeploy.js'
import {
  canUndeploy,
  describeUndeployTarget,
  renderUndeployPlan,
  type UndeployPlan,
  type UndeployTarget,
} from '../undeployPlan.js'

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

const options = (output: Output, flags: Partial<UndeployOptions['flags']> = {}): UndeployOptions =>
  ({flags: {'dry-run': false, yes: false, ...flags}, output}) as UndeployOptions

function target(overrides: Partial<UndeployTarget> = {}): UndeployTarget {
  return {
    activeDeployment: null,
    appHost: 'my-studio',
    createdAt: null,
    id: 'app-1',
    organizationId: null,
    projectId: 'project-1',
    title: null,
    type: 'studio',
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
      expect.stringContaining('Undeploys studio https://my-studio.sanity.studio'),
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

    expect(undeploy).toHaveBeenCalledWith(expect.objectContaining({id: 'app-1'}))
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
          solution: 'Set `deployment.appId` in sanity.cli.ts',
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
          target: target({id: 'core-1', title: 'My App', type: 'coreApp'}),
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

describe('describeUndeployTarget', () => {
  test('a found studio → pass check naming its URL', () => {
    expect(describeUndeployTarget({target: target(), type: 'found'})).toEqual({
      message: 'Undeploys studio https://my-studio.sanity.studio',
      status: 'pass',
    })
  })

  test('a found application → pass check naming title and ID', () => {
    const check = describeUndeployTarget({
      target: target({id: 'core-1', title: 'My App', type: 'coreApp'}),
      type: 'found',
    })
    expect(check).toEqual({message: 'Undeploys application "My App" (core-1)', status: 'pass'})
  })

  test('an untitled application → pass check naming the ID', () => {
    const check = describeUndeployTarget({
      target: target({id: 'core-1', type: 'coreApp'}),
      type: 'found',
    })
    expect(check.message).toBe('Undeploys application core-1')
  })

  test('nothing to undeploy → skip check carrying the reason and fix', () => {
    expect(
      describeUndeployTarget({
        message: 'No application ID provided',
        solution: 'Set it',
        type: 'none',
      }),
    ).toEqual({message: 'No application ID provided', solution: 'Set it', status: 'skip'})
  })
})

describe('canUndeploy', () => {
  test('true with a target and no failing checks', () => {
    const plan: UndeployPlan = {
      checks: [{message: 'ok', status: 'pass'}],
      target: target(),
      type: 'studio',
    }
    expect(canUndeploy(plan)).toBe(true)
  })

  test('false without a target', () => {
    expect(canUndeploy({checks: [], target: null, type: 'studio'})).toBe(false)
  })

  test('false with a failing check', () => {
    const plan: UndeployPlan = {
      checks: [{message: 'boom', status: 'fail'}],
      target: target(),
      type: 'studio',
    }
    expect(canUndeploy(plan)).toBe(false)
  })
})

describe('renderUndeployPlan', () => {
  test('an undeployable studio renders the target check without a verdict line', () => {
    const output = mockOutput()
    renderUndeployPlan(
      {
        checks: [{message: 'Undeploys studio https://my-studio.sanity.studio', status: 'pass'}],
        target: target(),
        type: 'studio',
      },
      output,
    )

    const logged = vi.mocked(output.log).mock.calls.map((call) => String(call[0]))
    expect(logged[0]).toContain('Dry run — no changes made.')
    expect(logged.some((line) => line.includes('Undeploys studio'))).toBe(true)
    expect(logged.some((line) => line.includes('can be undeployed'))).toBe(false)
  })

  test('renders the target details for humans', () => {
    const output = mockOutput()
    renderUndeployPlan(
      {
        checks: [],
        target: target({
          activeDeployment: {
            deployedAt: '2024-01-02T00:00:00Z',
            deployedBy: 'gustav@sanity.io',
            version: '3.99.0',
          },
          title: 'My Studio',
        }),
        type: 'studio',
      },
      output,
    )

    const logged = vi
      .mocked(output.log)
      .mock.calls.map((call) => String(call[0]))
      .join('\n')
    expect(logged).toContain('My Studio')
    expect(logged).toContain('app-1')
    expect(logged).toContain('https://my-studio.sanity.studio')
    expect(logged).toContain('version 3.99.0')
    expect(logged).toContain('by gustav@sanity.io')
  })

  test('no target renders "Nothing to undeploy." without a verdict', () => {
    const output = mockOutput()
    renderUndeployPlan(
      {
        checks: [{message: 'No application ID provided', status: 'skip'}],
        target: null,
        type: 'coreApp',
      },
      output,
    )

    const logged = vi.mocked(output.log).mock.calls.map((call) => String(call[0]))
    expect(logged.some((line) => line.includes('Nothing to undeploy.'))).toBe(true)
    expect(logged.some((line) => line.includes('can be undeployed'))).toBe(false)
  })

  test('a failing check renders the blocked verdict and the problem with its fix', () => {
    const output = mockOutput()
    renderUndeployPlan(
      {
        checks: [{message: 'boom', solution: 'do X', status: 'fail'}],
        target: null,
        type: 'coreApp',
      },
      output,
    )

    const logged = vi.mocked(output.log).mock.calls.map((call) => String(call[0]))
    expect(logged.some((line) => line.includes('Application can not be undeployed.'))).toBe(true)
    expect(logged.some((line) => line.includes('Problems to fix:'))).toBe(true)
    expect(logged.some((line) => line.includes('boom: do X'))).toBe(true)
  })
})
