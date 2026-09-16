import {Readable} from 'node:stream'

import {getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {definePanelView, defineWindowView} from '../../../contract.js'
import {defineApplication} from '../../../defineApp.js'
import {type BrettAccess, type BrettWorkspace} from '../../../services/applications.js'
import {createCoreApp, createStudio, deployWorkbenchApp} from '../deployWorkbenchApp.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: () => ({start: () => ({clear: vi.fn(), fail: vi.fn(), succeed: vi.fn()})}),
}))

vi.mock('tar', () => ({c: () => ({pipe: () => Readable.from(['tar'])})}))

const mockClient = {request: vi.fn()}
const app = defineApplication({
  entry: './src/App.tsx',
  organizationId: 'org-1',
  slug: 'drop-desk',
  title: 'Drop Desk',
  webWorkers: [{name: 'unread', src: './src/unread.ts', title: 'unread', type: 'worker'}],
})
const workspaces: BrettWorkspace[] = [
  {
    basePath: '/',
    dataset: 'production',
    name: 'default',
    projectId: 'proj-1',
    schemaDescriptorId: 'desc-1',
    title: 'Default',
  },
]
const access: BrettAccess[] = [{resourceId: 'proj-1.production', resourceType: 'dataset'}]
const icon = '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>'

/** The (name, value) pairs a call appended to its FormData. */
function appendedFields(): Array<[string, unknown]> {
  return appendSpy.mock.calls.map((call: unknown[]) => [call[0], call[1]] as [string, unknown])
}
let appendSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.mocked(getGlobalCliClient).mockResolvedValue(mockClient as never)
  appendSpy = vi.spyOn(FormData.prototype, 'append')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('createCoreApp', () => {
  test('creates a coreApp at the given slug as JSON, carrying no deployment', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    expect(
      await createCoreApp({organizationId: 'org-1', slug: 'abc123', title: 'Drop Desk'}),
    ).toMatchObject({application: {id: 'app_new'}})
    // A record-only create is a plain JSON POST (no multipart, no tarball).
    expect(mockClient.request).toHaveBeenCalledWith({
      body: {organizationId: 'org-1', slug: 'abc123', title: 'Drop Desk', type: 'coreApp'},
      method: 'POST',
      url: '/applications',
    })
  })

  test('forwards name (the identity) in the create body', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await createCoreApp({
      name: 'drop-desk',
      organizationId: 'org-1',
      slug: 'drop-desk-host',
      title: 'Drop Desk',
    })

    expect(mockClient.request.mock.calls[0][0].body).toMatchObject({name: 'drop-desk'})
  })

  test('forwards isSingleton in the create body', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await createCoreApp({
      isSingleton: true,
      organizationId: 'org-1',
      slug: 'media-library',
      title: 'Media Library',
    })

    expect(mockClient.request.mock.calls[0][0].body).toMatchObject({isSingleton: true})
  })

  test('forwards visibility as a create-time field', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'})

    await createCoreApp({
      organizationId: 'org-1',
      slug: 'abc123',
      title: 'Drop Desk',
      visibility: 'unlisted',
    })

    expect(mockClient.request.mock.calls[0][0].body).toMatchObject({visibility: 'unlisted'})
  })

  test('rollback deletes the record it just created', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'app_new'}).mockResolvedValueOnce(undefined)

    const {rollback} = await createCoreApp({
      organizationId: 'org-1',
      slug: 'abc123',
      title: 'Drop Desk',
    })
    await rollback()

    expect(mockClient.request).toHaveBeenLastCalledWith({
      method: 'DELETE',
      url: '/applications/app_new',
    })
  })
})

describe('createStudio', () => {
  test('creates a studio at the given slug and returns the record', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'studio_new'})

    expect(
      await createStudio({
        organizationId: 'org-1',
        projectId: 'proj-1',
        slug: 'my-studio',
        title: 'My Studio',
      }),
    ).toMatchObject({application: {id: 'studio_new'}})
    expect(mockClient.request).toHaveBeenCalledWith({
      body: {
        config: {studio: {projectId: 'proj-1'}},
        organizationId: 'org-1',
        slug: 'my-studio',
        title: 'My Studio',
        type: 'studio',
      },
      method: 'POST',
      url: '/applications',
    })
  })

  test('forwards visibility as a create-time field', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'studio_new'})

    await createStudio({
      organizationId: 'org-1',
      projectId: 'proj-1',
      slug: 'my-studio',
      title: 'My Studio',
      visibility: 'unlisted',
    })

    expect(mockClient.request.mock.calls[0][0].body).toMatchObject({visibility: 'unlisted'})
  })

  test('omits visibility when none is declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'studio_new'})

    await createStudio({
      organizationId: 'org-1',
      projectId: 'proj-1',
      slug: 'my-studio',
      title: 'My Studio',
    })

    expect(mockClient.request.mock.calls[0][0].body).not.toHaveProperty('visibility')
  })
})

describe('deployWorkbenchApp', () => {
  test('POSTs a deployment (interfaces + tarball) to the application', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: '/applications/app_1/deployments',
    })
    const fields = appendedFields()
    expect(fields).toContainEqual(['version', '1.0.0'])
    // The app's interfaces, stamped with the deployment version and stripped of
    // what Brett owns: the local id and `src`. The app view titles itself after the app.
    expect(JSON.parse(String(fields.find(([name]) => name === 'interfaces')?.[1]))).toEqual([
      {
        metadata: null,
        moduleId: 'services/unread',
        name: 'unread',
        title: 'unread',
        type: 'worker',
        version: '1.0.0',
      },
      {
        metadata: null,
        moduleId: 'App',
        name: 'drop-desk',
        title: 'Drop Desk',
        type: 'app',
        version: '1.0.0',
      },
    ])
    expect(fields.map(([name]) => name)).toContain('tarball')
  })

  test('sends a tile interface carrying its size + order as metadata', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    const tileApp = defineApplication({
      entry: './src/App.tsx',
      organizationId: 'org-1',
      slug: 'drop-desk',
      title: 'Drop Desk',
      views: [
        {
          name: 'agent',
          order: 100,
          size: 'large',
          src: './src/tile.tsx',
          surface: 'tile',
          title: 'Agent',
        },
      ],
    })

    await deployWorkbenchApp({
      app: tileApp,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    const fields = appendedFields()
    const interfaces = JSON.parse(String(fields.find(([name]) => name === 'interfaces')?.[1]))
    // Brett owns `id`/`src`, so they're stripped; `size`/`order` ride as metadata.
    expect(interfaces).toContainEqual({
      metadata: {order: 100, size: 'large'},
      moduleId: 'views/agent',
      name: 'agent',
      title: 'Agent',
      type: 'tile',
      version: '1.0.0',
    })
  })

  test('sends entry, panel, and window views with inherited placement metadata', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    const placedApp = defineApplication({
      dock: {group: 'applications', order: 100},
      entry: './src/App.tsx',
      organizationId: 'org-1',
      slug: 'drop-desk',
      title: 'Drop Desk',
      views: [
        definePanelView({
          dock: {order: 20},
          name: 'feed',
          src: './src/Feed.tsx',
          title: 'Feed',
        }),
        defineWindowView({
          dock: {group: 'user'},
          name: 'settings',
          src: './src/Settings.tsx',
          title: 'Settings',
        }),
      ],
    })

    await deployWorkbenchApp({
      app: placedApp,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    const fields = appendedFields()
    expect(JSON.parse(String(fields.find(([name]) => name === 'interfaces')?.[1]))).toEqual([
      {
        metadata: {dock: {group: 'applications', order: 20}},
        moduleId: 'views/feed',
        name: 'feed',
        title: 'Feed',
        type: 'panel',
        version: '1.0.0',
      },
      {
        metadata: {dock: {group: 'user', order: 100}},
        moduleId: 'App',
        name: 'settings',
        title: 'Settings',
        type: 'app',
        version: '1.0.0',
      },
      {
        metadata: {dock: {group: 'applications', order: 100}},
        moduleId: 'App',
        name: 'drop-desk',
        title: 'Drop Desk',
        type: 'app',
        version: '1.0.0',
      },
    ])
  })

  test('sends workspaces for a studio deployment', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app: {...app, entry: undefined},
      applicationId: 'studio_1',
      isApp: false,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/studio',
      title: 'My Studio',
      version: '3.0.0',
      workspaces,
    })

    expect(appendedFields()).toContainEqual(['workspaces', JSON.stringify(workspaces)])
  })

  test('forwards access to the deployment when provided', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      access,
      app: {...app, entry: undefined},
      applicationId: 'studio_1',
      isApp: false,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/studio',
      title: 'My Studio',
      version: '3.0.0',
      workspaces,
    })

    expect(appendedFields()).toContainEqual(['access', JSON.stringify(access)])
  })

  test('syncs the title and icon after shipping the deployment', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      icon,
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {icon, title: 'Drop Desk'},
      method: 'PATCH',
      url: '/applications/app_1',
    })
  })

  test('syncs the title without an icon when none is declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {title: 'Drop Desk'},
      method: 'PATCH',
      url: '/applications/app_1',
    })
  })

  test('syncs visibility on redeploy when declared', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
      visibility: 'unlisted',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {title: 'Drop Desk', visibility: 'unlisted'},
      method: 'PATCH',
      url: '/applications/app_1',
    })
  })

  test('syncs the configured slug on redeploy, so renaming it in config takes effect', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      slug: 'media',
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0]).toEqual({
      body: {slug: 'media', title: 'Drop Desk'},
      method: 'PATCH',
      url: '/applications/app_1',
    })
  })

  test('omits the slug when none is passed', async () => {
    mockClient.request.mockResolvedValueOnce({id: 'dep_1'}).mockResolvedValueOnce(undefined)

    await deployWorkbenchApp({
      app,
      applicationId: 'app_1',
      isApp: true,
      isAutoUpdating: false,
      sourceDir: '/tmp/build/app',
      title: 'Drop Desk',
      version: '1.0.0',
    })

    expect(mockClient.request.mock.calls[1][0].body).not.toHaveProperty('slug')
  })

  test('names the slug and the server reason when the slug is rejected', async () => {
    mockClient.request
      .mockResolvedValueOnce({id: 'dep_1'})
      .mockRejectedValueOnce(
        Object.assign(new Error('Slug "media" is already in use'), {statusCode: 409}),
      )

    await expect(
      deployWorkbenchApp({
        app,
        applicationId: 'app_1',
        isApp: true,
        isAutoUpdating: false,
        slug: 'media',
        sourceDir: '/tmp/build/app',
        title: 'Drop Desk',
        version: '1.0.0',
      }),
    ).rejects.toThrow(
      'Slug "media" was rejected: Slug "media" is already in use. The deployment is live at the application\'s previous slug — change `app.slug` in sanity.cli.ts and deploy again.',
    )
  })

  test('leaves a non-rejection failure of the metadata sync untouched', async () => {
    mockClient.request
      .mockResolvedValueOnce({id: 'dep_1'})
      .mockRejectedValueOnce(Object.assign(new Error('Internal server error'), {statusCode: 500}))

    await expect(
      deployWorkbenchApp({
        app,
        applicationId: 'app_1',
        isApp: true,
        isAutoUpdating: false,
        slug: 'media',
        sourceDir: '/tmp/build/app',
        title: 'Drop Desk',
        version: '1.0.0',
      }),
    ).rejects.toThrow('Internal server error')
  })

  test('fires onDeployed before syncing metadata, so a failed sync cannot roll back', async () => {
    mockClient.request
      .mockResolvedValueOnce({id: 'dep_1'})
      .mockRejectedValueOnce(new Error('patch failed'))
    const onDeployed = vi.fn(() => {
      // The metadata PATCH must not have run yet when the app is declared live.
      expect(mockClient.request).toHaveBeenCalledTimes(1)
    })

    await expect(
      deployWorkbenchApp({
        app,
        applicationId: 'app_1',
        isApp: true,
        isAutoUpdating: false,
        onDeployed,
        sourceDir: '/tmp/build/app',
        title: 'Drop Desk',
        version: '1.0.0',
      }),
    ).rejects.toThrow('patch failed')

    expect(onDeployed).toHaveBeenCalledTimes(1)
  })

  test('does not fire onDeployed when the deployment fails', async () => {
    mockClient.request.mockRejectedValueOnce(new Error('deploy failed'))
    const onDeployed = vi.fn()

    await expect(
      deployWorkbenchApp({
        app,
        applicationId: 'app_1',
        isApp: true,
        isAutoUpdating: false,
        onDeployed,
        sourceDir: '/tmp/build/app',
        title: 'Drop Desk',
        version: '1.0.0',
      }),
    ).rejects.toThrow('deploy failed')

    expect(onDeployed).not.toHaveBeenCalled()
  })
})
