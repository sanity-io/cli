import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type MediaLibraryField,
  unstable_defineApp,
  unstable_defineMediaLibrary,
} from '../../../defineApp.js'
import {type DeployableWorkbenchApp, getWorkbench} from '../../deploy/getWorkbench.js'
import {createWorkbenchUndeployAdapter} from '../workbenchUndeployAdapter.js'

const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getGlobalCliClient: mockGetGlobalCliClient,
}))

function workbenchApp(): DeployableWorkbenchApp {
  const app = getWorkbench({
    app: unstable_defineApp({
      name: 'my-app',
      organizationId: 'org-1',
      title: 'My App',
      views: [{name: 'insights', src: './src/Insights.tsx', title: 'Insights', type: 'panel'}],
    }),
  } as CliConfig)
  if (!app) throw new Error('expected a workbench app')
  return app
}

function mediaLibraryApp(
  fields: MediaLibraryField[] = [{name: 'alt', src: './src/alt.ts', title: 'Alt text'}],
): DeployableWorkbenchApp {
  const app = getWorkbench({
    app: unstable_defineMediaLibrary({fields, organizationId: 'org-1'}),
  } as CliConfig)
  if (!app) throw new Error('expected a workbench app')
  return app
}

beforeEach(() => mockGetGlobalCliClient.mockResolvedValue({request: mockRequest}))
afterEach(() => vi.clearAllMocks())

const appAdapter = () =>
  createWorkbenchUndeployAdapter({
    appId: 'wb-app-1',
    organizationId: 'org-1',
    type: 'coreApp',
    workbench: workbenchApp(),
  })

const configAdapter = () =>
  createWorkbenchUndeployAdapter({
    appId: undefined,
    organizationId: 'org-1',
    type: 'coreApp',
    workbench: mediaLibraryApp(),
  })

function stubInstallations(configs: unknown[]) {
  mockRequest.mockImplementation(async ({uri}: {uri: string}) => {
    if (uri === '/installations') {
      return {data: [{application: {slug: 'media-library'}, id: 'inst-1'}]}
    }
    if (uri === '/installations/inst-1/configs') return {data: configs}
    throw new Error(`unexpected request to ${uri}`)
  })
}

describe('createWorkbenchUndeployAdapter — application', () => {
  test('no appId → nothing to undeploy, with the fix', async () => {
    const resolution = await createWorkbenchUndeployAdapter({
      appId: undefined,
      organizationId: 'org-1',
      type: 'coreApp',
      workbench: workbenchApp(),
    }).resolveTarget()

    expect(resolution).toMatchObject({message: 'No `deployment.appId` configured', type: 'none'})
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('unknown appId → nothing to undeploy', async () => {
    mockRequest.mockRejectedValue(Object.assign(new Error('not found'), {statusCode: 404}))
    const resolution = await appAdapter().resolveTarget()
    expect(resolution).toMatchObject({
      message: 'Application with the given ID does not exist',
      type: 'none',
    })
  })

  test('found → target with the Brett application, its interfaces, and dashboard URL', async () => {
    mockRequest.mockResolvedValue({
      id: 'wb-app-1',
      organizationId: 'org-1',
      slug: 'my-app-x1',
      title: 'My App',
      type: 'coreApp',
    })

    const resolution = await appAdapter().resolveTarget()

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({uri: '/applications/wb-app-1'}),
    )
    expect(resolution.type === 'found' && resolution.target).toMatchObject({
      deletes: 'application',
      id: 'wb-app-1',
      interfaces: [{name: 'insights', title: 'Insights', type: 'panel'}],
      organizationId: 'org-1',
      title: 'My App',
      type: 'coreApp',
      url: expect.stringContaining('/@org-1/application/wb-app-1'),
    })
  })

  test('a studio target points at its sanity.studio hostname', async () => {
    mockRequest.mockResolvedValue({
      id: 'wb-studio-1',
      organizationId: 'org-1',
      slug: 'my-studio',
      title: 'My Studio',
      type: 'studio',
    })

    const resolution = await createWorkbenchUndeployAdapter({
      appId: 'wb-studio-1',
      organizationId: 'org-1',
      type: 'studio',
      workbench: workbenchApp(),
    }).resolveTarget()

    expect(resolution.type === 'found' && resolution.target.url).toBe(
      'https://my-studio.sanity.studio',
    )
  })

  test('undeploy deletes the Brett application', async () => {
    mockRequest.mockResolvedValue({
      id: 'wb-app-1',
      organizationId: 'org-1',
      slug: 'my-app-x1',
      title: 'My App',
      type: 'coreApp',
    })
    const instance = appAdapter()
    const resolution = await instance.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    await instance.undeploy(resolution.target)

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({method: 'DELETE', uri: '/applications/wb-app-1'}),
    )
  })

  test('an already-deleted application counts as undeployed', async () => {
    mockRequest.mockResolvedValue({
      id: 'wb-app-1',
      organizationId: 'org-1',
      slug: 'my-app-x1',
      title: 'My App',
      type: 'coreApp',
    })
    const instance = appAdapter()
    const resolution = await instance.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    mockRequest.mockRejectedValue(Object.assign(new Error('not found'), {statusCode: 404}))
    await expect(instance.undeploy(resolution.target)).resolves.toBeUndefined()
  })

  test('the summary carries the interface lines the report renders', async () => {
    mockRequest.mockResolvedValue({
      id: 'wb-app-1',
      organizationId: 'org-1',
      slug: 'my-app-x1',
      title: 'My App',
      type: 'coreApp',
    })

    const resolution = await appAdapter().resolveTarget()

    expect(resolution.type === 'found' && resolution.target.summary?.join('\n')).toContain(
      'Insights (insights)',
    )
  })
})

describe('createWorkbenchUndeployAdapter — config-only singleton', () => {
  test('resolves the installation and its config snapshots', async () => {
    stubInstallations([
      {
        createdAt: '2024-02-01T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
        id: 'cfg-2',
        isActive: true,
        version: '2.0.0',
      },
      {
        createdAt: '2024-01-01T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
        id: 'cfg-1',
        version: '1.0.0',
      },
    ])

    const resolution = await configAdapter().resolveTarget()

    expect(resolution.type === 'found' && resolution.target).toMatchObject({
      // The active snapshot is the config being served
      activeDeployment: {
        deployedAt: '2024-02-01T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
      },
      configs: [expect.objectContaining({id: 'cfg-2'}), expect.objectContaining({id: 'cfg-1'})],
      createdAt: '2024-01-01T00:00:00Z',
      deletes: 'config',
      id: null,
      organizationId: 'org-1',
      title: 'media-library',
    })
  })

  test('workbench internals and versions stay off the target', async () => {
    stubInstallations([
      {
        createdAt: '2024-01-01T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
        id: 'cfg-1',
        isActive: true,
        version: '1.0.0',
      },
    ])

    const resolution = await configAdapter().resolveTarget()
    if (resolution.type !== 'found' || resolution.target.deletes !== 'config') {
      throw new Error('expected a config target')
    }

    expect(resolution.target).not.toHaveProperty('fields')
    expect(resolution.target).not.toHaveProperty('installationId')
    expect(resolution.target).not.toHaveProperty('isSingleton')
    expect(resolution.target.activeDeployment).not.toHaveProperty('version')
    expect(resolution.target.configs[0]).not.toHaveProperty('version')
  })

  test('a media library without local fields still undeploys its config', async () => {
    stubInstallations([{createdAt: '2024-01-01T00:00:00Z', id: 'cfg-1', isActive: true}])

    const resolution = await createWorkbenchUndeployAdapter({
      appId: undefined,
      organizationId: 'org-1',
      type: 'coreApp',
      workbench: mediaLibraryApp([]),
    }).resolveTarget()

    expect(resolution.type === 'found' && resolution.target).toMatchObject({
      configs: [expect.objectContaining({id: 'cfg-1'})],
      deletes: 'config',
    })
  })

  test('history without an active snapshot reports no active deployment', async () => {
    stubInstallations([{createdAt: '2024-01-01T00:00:00Z', id: 'cfg-1', version: '1.0.0'}])

    const resolution = await configAdapter().resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    expect(resolution.target.activeDeployment).toBeNull()
  })

  test('no active installation → nothing to undeploy', async () => {
    mockRequest.mockResolvedValue({data: []})
    const resolution = await configAdapter().resolveTarget()
    expect(resolution).toMatchObject({type: 'none'})
    expect(resolution.type === 'none' && resolution.message).toContain(
      'No active "media-library" installation',
    )
  })

  test('no deployed config → nothing to undeploy', async () => {
    stubInstallations([])
    const resolution = await configAdapter().resolveTarget()
    expect(resolution).toMatchObject({type: 'none'})
    expect(resolution.type === 'none' && resolution.message).toContain('No deployed config')
  })

  test('missing organizationId → throws, the installation cannot be resolved', async () => {
    await expect(
      createWorkbenchUndeployAdapter({
        appId: undefined,
        organizationId: undefined,
        type: 'coreApp',
        workbench: mediaLibraryApp(),
      }).resolveTarget(),
    ).rejects.toThrow(/organization identifier/)
  })

  test('undeploy deletes every config snapshot', async () => {
    stubInstallations([
      {id: 'cfg-2', version: '2.0.0'},
      {id: 'cfg-1', version: '1.0.0'},
    ])
    const instance = configAdapter()
    const resolution = await instance.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    mockRequest.mockResolvedValue({deleted: true})
    await instance.undeploy(resolution.target)

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({method: 'DELETE', uri: '/installations/inst-1/configs/cfg-2'}),
    )
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({method: 'DELETE', uri: '/installations/inst-1/configs/cfg-1'}),
    )
  })

  test('an already-deleted config snapshot counts as undeployed', async () => {
    stubInstallations([{id: 'cfg-1', version: '1.0.0'}])
    const instance = configAdapter()
    const resolution = await instance.resolveTarget()
    if (resolution.type !== 'found') throw new Error('expected found')

    mockRequest.mockRejectedValue(Object.assign(new Error('not found'), {statusCode: 404}))
    await expect(instance.undeploy(resolution.target)).resolves.toBeUndefined()
  })

  test('the summary carries the config lines the report renders', async () => {
    stubInstallations([{createdAt: '2024-01-01T00:00:00Z', id: 'cfg-1', version: '1.0.0'}])

    const resolution = await configAdapter().resolveTarget()
    const summary = resolution.type === 'found' ? (resolution.target.summary ?? []).join('\n') : ''

    expect(summary).toContain('Alt text (alt): ./src/alt.ts')
    expect(summary).not.toContain('Config snapshots')
  })
})
