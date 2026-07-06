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

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const {createMockSpinner} = await import('@sanity/cli-test')
  return {
    ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
    spinner: createMockSpinner({
      clear: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      info: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }),
  }
})

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
  test('should pass the title through when registering the configured host', async () => {
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
    expect(result).toBe(created)
  })
})
