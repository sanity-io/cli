import {type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-test/mocks/cli-core/ux'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {runUndeploy, type UndeployAdapter, type UndeployOptions} from '../runUndeploy.js'
import {
  canUndeploy,
  describeUndeployTarget,
  renderUndeployPlan,
  type UndeployPlan,
  undeployPlanToJson,
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

describe('runUndeploy --json', () => {
  test('a dry run emits the plan as JSON on stdout only', async () => {
    const output = mockOutput()
    await runUndeploy(options(output, {'dry-run': true, json: true}), adapter())

    const logged = vi.mocked(output.log).mock.calls.map((call) => String(call[0]))
    expect(logged).toHaveLength(1)
    const payload = JSON.parse(logged[0]!)
    expect(payload.canUndeploy).toBe(true)
    expect(payload.application.id).toBe('app-1')
  })

  test('a real run emits an {undeployed: true} envelope with the target', async () => {
    const output = mockOutput()
    await runUndeploy(options(output, {json: true, yes: true}), adapter())

    const payload = JSON.parse(String(vi.mocked(output.log).mock.calls.at(-1)![0]))
    expect(payload.undeployed).toBe(true)
    expect(payload.application.id).toBe('app-1')
  })

  test("without `yes` the runner still confirms — unattended consent is the command's job", async () => {
    const output = mockOutput()
    const undeploy = vi.fn()
    vi.mocked(confirm).mockResolvedValueOnce(false)
    await runUndeploy(options(output, {json: true}), adapter({undeploy}))

    expect(confirm).toHaveBeenCalled()
    expect(undeploy).not.toHaveBeenCalled()
  })

  test('nothing to undeploy emits {undeployed: false} with the reason', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {json: true, yes: true}),
      adapter({resolveTarget: async () => ({message: 'No application ID provided', type: 'none'})}),
    )

    const payload = JSON.parse(String(vi.mocked(output.log).mock.calls.at(-1)![0]))
    expect(payload).toEqual({reason: 'No application ID provided', undeployed: false})
  })

  test('a failed deletion emits a {undeployed: false} error envelope and still errors on stderr', async () => {
    const output = mockOutput()
    await runUndeploy(
      options(output, {json: true, yes: true}),
      adapter({
        undeploy: async () => {
          throw new Error('boom')
        },
      }),
    )

    const payload = JSON.parse(String(vi.mocked(output.log).mock.calls.at(-1)![0]))
    expect(payload.undeployed).toBe(false)
    expect(payload.error.message).toContain('boom')
    expect(output.error).toHaveBeenCalledWith(payload.error.message, {exit: 1})
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
      reason: null,
      target: target(),
      type: 'studio',
    }
    expect(canUndeploy(plan)).toBe(true)
  })

  test('false without a target', () => {
    expect(canUndeploy({checks: [], reason: null, target: null, type: 'studio'})).toBe(false)
  })

  test('false with a failing check', () => {
    const plan: UndeployPlan = {
      checks: [{message: 'boom', status: 'fail'}],
      reason: null,
      target: target(),
      type: 'studio',
    }
    expect(canUndeploy(plan)).toBe(false)
  })
})

describe('undeployPlanToJson', () => {
  test('derives errors and warnings from the same checks the human report renders', () => {
    const json = undeployPlanToJson({
      checks: [
        {message: 'ok', status: 'pass'},
        {message: 'heads up', status: 'warn'},
        {message: 'boom', solution: 'do X', status: 'fail'},
      ],
      reason: null,
      target: target(),
      type: 'studio',
    })

    expect(json).toEqual({
      application: target(),
      canUndeploy: false,
      errors: {boom: 'do X'},
      reason: null,
      warnings: ['heads up'],
    })
  })

  test('nothing to undeploy carries the reason for agents', () => {
    const json = undeployPlanToJson({
      checks: [{message: 'No application ID provided', status: 'skip'}],
      reason: 'No application ID provided',
      target: null,
      type: 'coreApp',
    })

    expect(json.canUndeploy).toBe(false)
    expect(json.errors).toEqual({})
    expect(json.reason).toBe('No application ID provided')
    expect(json.application).toBeNull()
  })

  test('an undeployable plan reports the full target', () => {
    const json = undeployPlanToJson({checks: [], reason: null, target: target(), type: 'studio'})
    expect(json.canUndeploy).toBe(true)
    expect(json.application).toEqual(target())
  })
})

describe('renderUndeployPlan', () => {
  test('an undeployable studio renders the target check without a verdict line', () => {
    const output = mockOutput()
    renderUndeployPlan(
      {
        checks: [{message: 'Undeploys studio https://my-studio.sanity.studio', status: 'pass'}],
        reason: null,
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
        reason: null,
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
        reason: 'No application ID provided',
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
        reason: null,
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
