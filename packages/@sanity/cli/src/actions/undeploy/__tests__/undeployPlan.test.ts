import {type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {type UndeployTarget} from '../types.js'
import {
  canUndeploy,
  describeUndeployTarget,
  renderUndeployPlan,
  type UndeployPlan,
} from '../undeployPlan.js'

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

function target(overrides: Partial<UndeployTarget> = {}): UndeployTarget {
  return {
    activeDeployment: null,
    appHost: 'my-studio',
    applicationId: 'app-1',
    applicationType: 'studio',
    createdAt: '2024-01-01T00:00:00Z',
    organizationId: null,
    projectId: 'project-1',
    title: null,
    url: 'https://my-studio.sanity.studio',
    ...overrides,
  }
}

describe('describeUndeployTarget', () => {
  test('a found studio → pass check naming its URL', () => {
    expect(describeUndeployTarget({target: target(), type: 'found'})).toEqual({
      message: 'Undeploys studio https://my-studio.sanity.studio',
      status: 'pass',
    })
  })

  test('a found application → pass check naming title and ID', () => {
    const check = describeUndeployTarget({
      target: target({applicationId: 'core-1', applicationType: 'coreApp', title: 'My App'}),
      type: 'found',
    })
    expect(check).toEqual({message: 'Undeploys application "My App" (core-1)', status: 'pass'})
  })

  test('an untitled application → pass check naming the ID', () => {
    const check = describeUndeployTarget({
      target: target({applicationId: 'core-1', applicationType: 'coreApp'}),
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
  test('an undeployable studio renders the verdict and the consequence', () => {
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
    expect(logged.some((line) => line.includes('This studio can be undeployed.'))).toBe(true)
    expect(logged.some((line) => line.includes('available for anyone to claim'))).toBe(true)
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
    expect(logged.some((line) => line.includes("This application can't be undeployed."))).toBe(true)
    expect(logged.some((line) => line.includes('Problems to fix:'))).toBe(true)
    expect(logged.some((line) => line.includes('boom: do X'))).toBe(true)
  })
})
