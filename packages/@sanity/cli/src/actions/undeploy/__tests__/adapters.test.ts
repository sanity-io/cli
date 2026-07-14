import {type CliConfig} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {userApplication} from '../../../services/__tests__/testHelpers.js'
import {deleteUserApplication, getUserApplication} from '../../../services/userApplications.js'
import {createAppUndeployAdapter, createStudioUndeployAdapter} from '../adapters.js'

vi.mock('../../../services/userApplications.js', () => ({
  deleteUserApplication: vi.fn(),
  getUserApplication: vi.fn(),
}))

const mockGetUserApplication = vi.mocked(getUserApplication)

beforeEach(() => vi.clearAllMocks())

describe('createAppUndeployAdapter', () => {
  test('no appId configured → nothing to undeploy, with the fix', async () => {
    const resolution = await createAppUndeployAdapter({app: {}} as CliConfig).resolveTarget()
    expect(resolution).toMatchObject({message: 'No `deployment.appId` configured', type: 'none'})
  })

  test('unknown appId → nothing to undeploy', async () => {
    mockGetUserApplication.mockResolvedValue(null)
    const resolution = await createAppUndeployAdapter({
      app: {},
      deployment: {appId: 'nope'},
    } as CliConfig).resolveTarget()
    expect(resolution).toMatchObject({
      message: 'Application with the given ID does not exist',
      type: 'none',
    })
  })

  test('found → target with the application details and its URL', async () => {
    mockGetUserApplication.mockResolvedValue(
      userApplication({
        activeDeployment: {
          createdAt: '2024-01-02T00:00:00Z',
          deployedAt: '2024-01-02T00:00:00Z',
          deployedBy: 'gustav@sanity.io',
          isActiveDeployment: true,
          isAutoUpdating: null,
          size: null,
          updatedAt: '2024-01-02T00:00:00Z',
          version: '2.0.0',
        },
        id: 'core-1',
        organizationId: 'org-1',
        title: 'My App',
        type: 'coreApp',
      }),
    )

    const resolution = await createAppUndeployAdapter({
      app: {},
      deployment: {appId: 'core-1'},
    } as CliConfig).resolveTarget()

    expect(resolution.type).toBe('found')
    expect(resolution.type === 'found' && resolution.target).toMatchObject({
      activeDeployment: {
        deployedAt: '2024-01-02T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
      },
      id: 'core-1',
      organizationId: 'org-1',
      title: 'My App',
      type: 'coreApp',
      url: expect.stringContaining('/@org-1/application/core-1'),
    })
  })

  test('found without an organization → no URL', async () => {
    mockGetUserApplication.mockResolvedValue(userApplication({id: 'core-1', type: 'coreApp'}))
    const resolution = await createAppUndeployAdapter({
      app: {},
      deployment: {appId: 'core-1'},
    } as CliConfig).resolveTarget()
    expect(resolution.type === 'found' && resolution.target.url).toBeNull()
  })

  test('undeploy deletes the application as a coreApp', async () => {
    const adapter = createAppUndeployAdapter({app: {}, deployment: {appId: 'core-1'}} as CliConfig)
    mockGetUserApplication.mockResolvedValue(userApplication({id: 'core-1', type: 'coreApp'}))
    const resolution = await adapter.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    await adapter.undeploy(resolution.target)

    expect(deleteUserApplication).toHaveBeenCalledWith({
      applicationId: 'core-1',
      appType: 'coreApp',
    })
  })
})

describe('createStudioUndeployAdapter', () => {
  test('no studioHost or appId → nothing to undeploy, with the fix', async () => {
    const resolution = await createStudioUndeployAdapter({
      api: {projectId: 'test'},
    } as CliConfig).resolveTarget()
    expect(resolution).toMatchObject({
      message: 'No studio hostname configured',
      type: 'none',
    })
  })

  test('missing projectId → throws, undeploy cannot resolve the studio', async () => {
    await expect(
      createStudioUndeployAdapter({studioHost: 'my-studio'} as CliConfig).resolveTarget(),
    ).rejects.toThrow(/projectId/)
  })

  test('unknown studio → nothing to undeploy', async () => {
    mockGetUserApplication.mockResolvedValue(null)
    const resolution = await createStudioUndeployAdapter({
      api: {projectId: 'test'},
      studioHost: 'my-studio',
    } as CliConfig).resolveTarget()
    expect(resolution).toMatchObject({type: 'none'})
    expect(resolution.type === 'none' && resolution.message).toContain(
      'has not been assigned an app ID or a studio hostname',
    )
  })

  test('found → target with the hosted studio URL', async () => {
    mockGetUserApplication.mockResolvedValue(userApplication())
    const resolution = await createStudioUndeployAdapter({
      api: {projectId: 'test'},
      studioHost: 'my-studio',
    } as CliConfig).resolveTarget()

    expect(resolution.type === 'found' && resolution.target).toMatchObject({
      appHost: 'my-studio',
      id: 'app-1',
      type: 'studio',
      url: 'https://my-studio.sanity.studio',
    })
  })

  test('found external studio → target URL is the host itself', async () => {
    mockGetUserApplication.mockResolvedValue(
      userApplication({appHost: 'https://studio.example.com', urlType: 'external'}),
    )
    const resolution = await createStudioUndeployAdapter({
      api: {projectId: 'test'},
      studioHost: 'https://studio.example.com',
    } as CliConfig).resolveTarget()

    expect(resolution.type === 'found' && resolution.target.url).toBe('https://studio.example.com')
  })

  test('undeploy deletes the application as a studio', async () => {
    const adapter = createStudioUndeployAdapter({
      api: {projectId: 'test'},
      studioHost: 'my-studio',
    } as CliConfig)
    mockGetUserApplication.mockResolvedValue(userApplication())
    const resolution = await adapter.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    await adapter.undeploy(resolution.target)

    expect(deleteUserApplication).toHaveBeenCalledWith({applicationId: 'app-1', appType: 'studio'})
  })
})
