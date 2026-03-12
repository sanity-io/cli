import {confirm, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {UndeployCommand} from '../undeploy.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
    select: vi.fn(),
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
    expect(stdout).not.toContain('Remember to remove')
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
    expect(stdout).toContain('Remember to remove `deployment.appId`')
  })

  test('shows reminder for deprecated app.id config', async () => {
    mockApi({
      apiVersion: 'v2024-08-01',
      query: {appType: 'coreApp'},
      uri: '/user-applications/legacy-id',
    }).reply(200, {
      appHost: 'legacy-host',
      id: 'legacy-id',
    })

    mockApi({
      apiVersion: 'v2024-08-01',
      method: 'delete',
      query: {appType: 'coreApp'},
      uri: '/user-applications/legacy-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          app: {id: 'legacy-id'},
        },
        token: 'test-token',
      },
    })

    expect(stdout).toContain('Application undeploy scheduled')
    expect(stdout).toContain('Remember to remove `app.id`')
    expect(stdout).not.toContain('deployment.appId')
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
        isInteractive: true,
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
    expect(stdout).toContain('Remember to remove')
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
    expect(stdout).toContain('Remember to remove')
  })

  test('handles delete failure', async () => {
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
    }).reply(500, {message: 'Delete failed'})

    const {error, stderr} = await testCommand(UndeployCommand, ['--yes'], {
      mocks: {
        cliConfig: {
          api: {projectId: 'test'},
          studioHost: 'my-host',
        },
        token: 'test-token',
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Delete failed')
    expect(stderr).toContain('Undeploying studio')
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

    expect(stdout).toContain('The configured `appId` or `studioHost` does not exist.')
    expect(stdout).toContain('Nothing to undeploy')
  })

  describe('interactive selection when no appId/studioHost configured', () => {
    test('lists studios and undeploys selected one', async () => {
      // List studios for the project
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'studio'},
        uri: '/projects/test/user-applications',
      }).reply(200, [
        {appHost: 'my-studio', id: 'studio-1', title: 'My Studio', type: 'studio'},
        {appHost: 'other-studio', id: 'studio-2', title: 'Other Studio', type: 'studio'},
      ])

      // User selects studio-1
      vi.mocked(select).mockResolvedValueOnce('studio-1')
      vi.mocked(confirm).mockResolvedValueOnce(true)

      // Delete the selected studio
      mockApi({
        apiVersion: 'v2024-08-01',
        method: 'delete',
        query: {appType: 'studio'},
        uri: '/user-applications/studio-1',
      }).reply(200)

      const {error, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            api: {projectId: 'test'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select a studio to undeploy:',
        }),
      )
      expect(stdout).toContain('Studio undeploy scheduled')
    })

    test('lists apps and undeploys selected one', async () => {
      // List apps for the org
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'coreApp', organizationId: 'org-123'},
        uri: '/user-applications',
      }).reply(200, [
        {appHost: 'my-app', id: 'app-1', title: 'My App', type: 'coreApp'},
        {appHost: 'other-app', id: 'app-2', title: null, type: 'coreApp'},
      ])

      // User selects app-1
      vi.mocked(select).mockResolvedValueOnce('app-1')
      vi.mocked(confirm).mockResolvedValueOnce(true)

      // Delete the selected app
      mockApi({
        apiVersion: 'v2024-08-01',
        method: 'delete',
        query: {appType: 'coreApp'},
        uri: '/user-applications/app-1',
      }).reply(200)

      const {error, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            app: {organizationId: 'org-123'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select an application to undeploy:',
        }),
      )
      expect(stdout).toContain('Application undeploy scheduled')
    })

    test('shows appHost for apps without title in select choices', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'coreApp', organizationId: 'org-123'},
        uri: '/user-applications',
      }).reply(200, [
        {appHost: 'my-app-host', id: 'app-1', title: 'Titled App', type: 'coreApp'},
        {appHost: 'untitled-host', id: 'app-2', title: null, type: 'coreApp'},
      ])

      vi.mocked(select).mockResolvedValueOnce('app-1')
      vi.mocked(confirm).mockResolvedValueOnce(true)

      mockApi({
        apiVersion: 'v2024-08-01',
        method: 'delete',
        query: {appType: 'coreApp'},
        uri: '/user-applications/app-1',
      }).reply(200)

      const {error} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            app: {organizationId: 'org-123'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: [
            {name: 'Titled App (my-app-host)', value: 'app-1'},
            {name: 'untitled-host', value: 'app-2'},
          ],
        }),
      )
    })

    test('shows nothing to undeploy when no studios exist', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'studio'},
        uri: '/projects/test/user-applications',
      }).reply(200, [])

      const {error, stderr, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            api: {projectId: 'test'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(stderr).toContain('No deployed studios found for your project.')
      expect(stdout).toContain('Nothing to undeploy.')
      expect(select).not.toHaveBeenCalled()
    })

    test('shows nothing to undeploy when no apps exist', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'coreApp', organizationId: 'org-123'},
        uri: '/user-applications',
      }).reply(200, [])

      const {error, stderr, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            app: {organizationId: 'org-123'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(stderr).toContain('No deployed applications found for your organization.')
      expect(stdout).toContain('Nothing to undeploy.')
      expect(select).not.toHaveBeenCalled()
    })

    test('shows error when app listing API fails', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'coreApp', organizationId: 'org-123'},
        uri: '/user-applications',
      }).reply(500, {message: 'Internal server error'})

      const {error} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            app: {organizationId: 'org-123'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.oclif?.exit).toBe(2)
      expect(error?.message).toContain('Internal server error')
    })

    test('shows error when studio listing API fails', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'studio'},
        uri: '/projects/test/user-applications',
      }).reply(500, {message: 'Internal server error'})

      const {error} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            api: {projectId: 'test'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.oclif?.exit).toBe(2)
      expect(error?.message).toContain('Internal server error')
    })

    test('shows error when no project ID configured (studio context)', async () => {
      const {error, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {},
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(stdout).toContain('No project ID configured. Cannot list studios.')
      expect(select).not.toHaveBeenCalled()
    })

    test('shows error when no org ID configured (app context)', async () => {
      const {error, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            app: {},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(stdout).toContain('No organization ID configured. Cannot list applications.')
      expect(select).not.toHaveBeenCalled()
    })

    test('does not prompt for selection in --yes mode (studio)', async () => {
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
      expect(select).not.toHaveBeenCalled()
    })

    test('does not prompt for selection in --yes mode (app)', async () => {
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
      expect(select).not.toHaveBeenCalled()
    })

    test('does not undeploy if user rejects confirmation after selecting', async () => {
      mockApi({
        apiVersion: 'v2024-08-01',
        query: {appType: 'studio'},
        uri: '/projects/test/user-applications',
      }).reply(200, [{appHost: 'my-studio', id: 'studio-1', title: 'My Studio', type: 'studio'}])

      vi.mocked(select).mockResolvedValueOnce('studio-1')
      vi.mocked(confirm).mockResolvedValueOnce(false)

      const {error, stdout} = await testCommand(UndeployCommand, [], {
        mocks: {
          cliConfig: {
            api: {projectId: 'test'},
          },
          isInteractive: true,
          token: 'test-token',
        },
      })

      if (error) throw error
      expect(stdout).not.toContain('undeploy scheduled')
    })
  })
})
