import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {UndeployCommand} from '../undeploy.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
  }
})

describe('#undeploy', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('undeploys studio when studioHost is configured', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('undeploys application when app id is configured', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          app: {},
          deployment: {appId: 'core-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Application undeploy scheduled')
  })

  test('does nothing if no application found', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(404)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if no application found (app config)', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(404)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          app: {},
          deployment: {appId: 'core-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Application with the given ID does not exist.')
    expect(stdout).toContain('Nothing to undeploy.')
  })

  test('does nothing if studioHost and app ID are missing', async () => {
    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('No application ID or studio host provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if appId is missing', async () => {
    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          app: {},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('No application ID provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does not undeploy if prompt is rejected', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    vi.mocked(confirm).mockResolvedValueOnce(false)

    await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    // No delete call should be made since prompt was rejected
  })

  test('undeploys if prompt is accepted', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('undeploys app if prompt is accepted (app config)', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
      title: 'core-app',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {
          app: {},
          deployment: {appId: 'core-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Application undeploy scheduled')
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(
          /This will undeploy the following application:.*Title:.*core-app.*ID:.*core-id/s,
        ),
      }),
    )
  })

  test('undeploys app with missing title and reports using fallback value', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
      // title missing
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {
          app: {},
          deployment: {appId: 'core-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Application undeploy scheduled')
    expect(stdout).toContain('your application')
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/\(untitled application\)/),
      }),
    )
  })

  test('handles generic errors', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(500, {message: 'Generic error'})

    const {error, stderr} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Generic error')
    expect(stderr).toContain('Checking application info')
  })

  test('undeploys studio using deployment.appId', async () => {
    const appHost = 'my-studio'

    mockApi({
      apiVersion: 'v2024-08-01',
      uri: '/projects/test/user-applications/app-id',
    }).reply(200, {
      appHost,
      id: 'app-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          deployment: {appId: 'app-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('prioritizes deployment.appId over studioHost when both are configured', async () => {
    const appHost = 'my-host'

    // Should call by appId, NOT by appHost
    mockApi({
      apiVersion: 'v2024-08-01',
      uri: '/projects/test/user-applications/app-id',
    }).reply(200, {
      appHost,
      id: 'app-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          deployment: {appId: 'app-id'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('handles error when deployment.appId does not exist for the org', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      uri: '/projects/test/user-applications/non-existent-app-id',
    }).reply(404, {
      message: 'Application not found',
    })

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          deployment: {appId: 'non-existent-app-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Your project has not been assigned an app ID or a studio hostname')
    expect(stdout).toContain('Nothing to undeploy')
  })
})
