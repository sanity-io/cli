import {type CliConfig, type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createUserApplication, type UserApplication} from '../../../services/userApplications.js'
import {findUserApplication, findUserApplicationForStudio} from '../findUserApplication.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'

vi.mock('../resolveDeployTarget.js', () => ({
  resolveAppDeployTarget: vi.fn(),
  resolveStudioDeployTarget: vi.fn(),
}))

vi.mock('../../../services/userApplications.js', () => ({
  createUserApplication: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockResolveApp = vi.mocked(resolveAppDeployTarget)
const mockResolveStudio = vi.mocked(resolveStudioDeployTarget)
const mockCreate = vi.mocked(createUserApplication)

// output.error normally throws to abort; stubbed so the code falls through and a
// single assertion can prove the exit fired.
const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

beforeEach(() => vi.clearAllMocks())

describe('findUserApplication', () => {
  const baseOptions = {cliConfig: {} as CliConfig, organizationId: 'org-1'}

  test('should return null so the caller creates when unattended with a title', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const output = mockOutput()

    const result = await findUserApplication({
      ...baseOptions,
      output,
      title: 'My App',
      unattended: true,
    })

    expect(result).toBeNull()
    expect(output.error).not.toHaveBeenCalled()
  })

  test('should exit instead of creating when unattended without a title', async () => {
    mockResolveApp.mockResolvedValue({type: 'would-create'})
    const output = mockOutput()

    await findUserApplication({...baseOptions, output, unattended: true})

    expect(output.error).toHaveBeenCalled()
  })
})

describe('findUserApplicationForStudio', () => {
  test('registering a configured host passes the title through and reports created', async () => {
    const created = {title: 'My Studio'} as UserApplication
    mockResolveStudio.mockResolvedValue({appHost: 'new-host', type: 'would-create'})
    mockCreate.mockResolvedValue(created)
    const output = mockOutput()

    const result = await findUserApplicationForStudio({
      isExternal: false,
      output,
      projectId: 'project-1',
      title: 'My Studio',
    })

    expect(mockCreate).toHaveBeenCalledWith({
      appType: 'studio',
      body: {appHost: 'new-host', title: 'My Studio', type: 'studio', urlType: 'internal'},
      projectId: 'project-1',
    })
    // Registering a new host is a create, not an update — see #1462 (bugbot).
    expect(result).toEqual({application: created, created: true})
  })

  test('an existing host is an update, not a create', async () => {
    const existing = {appHost: 'my-studio', title: 'My Studio'} as UserApplication
    mockResolveStudio.mockResolvedValue({application: existing, type: 'found'})
    const output = mockOutput()

    const result = await findUserApplicationForStudio({
      appId: 'app-1',
      isExternal: false,
      output,
      projectId: 'project-1',
    })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result).toEqual({application: existing, created: false})
  })
})
