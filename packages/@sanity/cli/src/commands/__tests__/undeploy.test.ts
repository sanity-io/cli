import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
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
    const pending = pendingMocks()
    cleanAll()
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
        isInteractive: true,
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
        isInteractive: true,
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
        isInteractive: true,
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

    expect(stdout).toContain('No studio hostname configured')
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

    expect(stdout).toContain('No `deployment.appId` configured')
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

    const {error} = await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.oclif?.exit).toBe(3)
  })

  test('requires --yes before prompting in unattended mode', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {appHost: 'my-host', id: 'app-id'})

    const {error} = await testCommand(UndeployCommand, [], {
      mocks: {
        cliConfig: {api: {projectId: 'test'}, studioHost: 'my-host'},
        isInteractive: false,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Pass --yes to continue')
    expect(error?.oclif?.exit).toBe(2)
    expect(confirm).not.toHaveBeenCalled()
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
        isInteractive: true,
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
        isInteractive: true,
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
        isInteractive: true,
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

  test('dry run reports the studio without deleting it', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      activeDeployment: {
        deployedAt: '2024-01-02T00:00:00Z',
        deployedBy: 'gustav@sanity.io',
        version: '3.99.0',
      },
      appHost: 'my-host',
      id: 'app-id',
    })

    const {stdout} = await testCommand(UndeployCommand, ['--dry-run'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    // No DELETE mock is registered: the afterEach pending-mocks assertion
    // proves a dry run never calls it.
    expect(confirm).not.toHaveBeenCalled()
    expect(stdout).toContain('Dry run — no changes made.')
    expect(stdout).toContain('Undeploys studio https://my-host.sanity.studio')
    expect(stdout).toContain('version 3.99.0')
  })

  test('dry run reports the application without deleting it', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
      organizationId: 'org-id',
      title: 'core-app',
    })

    const {stdout} = await testCommand(UndeployCommand, ['--dry-run'], {
      mocks: {
        cliConfig: {
          app: {},
          deployment: {appId: 'core-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Dry run — no changes made.')
    expect(stdout).toContain('Undeploys application "core-app" (core-id)')
  })

  test('dry run with nothing to undeploy exits cleanly', async () => {
    const {stdout} = await testCommand(UndeployCommand, ['--dry-run'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Dry run — no changes made.')
    expect(stdout).toContain('No studio hostname configured')
    expect(stdout).toContain('Nothing to undeploy.')
  })

  test('dry run exits non-zero when the target cannot be resolved', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(500, {message: 'Generic error'})

    const {error, stdout} = await testCommand(UndeployCommand, ['--dry-run'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Studio can not be undeployed.')
    expect(stdout).toContain('Generic error')
    expect(error?.message).toContain('Undeploy blocked by failing checks.')
  })

  test('dry run with --json emits the plan as JSON', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    const {stdout} = await testCommand(UndeployCommand, ['--dry-run', '--json'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    const payload = JSON.parse(stdout)
    expect(payload.canUndeploy).toBe(true)
    expect(payload.application).toMatchObject({
      id: 'app-id',
      url: 'https://my-host.sanity.studio',
    })
  })

  test('--json with --yes undeploys and emits the result envelope', async () => {
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

    const {stdout} = await testCommand(UndeployCommand, ['--json', '--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    const payload = JSON.parse(stdout)
    expect(payload.undeployed).toBe(true)
    expect(payload.application.id).toBe('app-id')
  })

  test('--json without --yes reports the required confirmation as JSON', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    const {error, stdout} = await testCommand(UndeployCommand, ['--json'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(confirm).not.toHaveBeenCalled()
    const payload = JSON.parse(stdout)
    expect(payload).toEqual({
      error: {
        message: 'Undeploy requires confirmation in unattended mode. Pass --yes to continue.',
      },
      undeployed: false,
    })
    expect(error?.oclif?.exit).toBe(2)
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
