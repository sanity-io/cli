import {confirm} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {UndeployCommand} from '../undeploy.js'

vi.mock('@inquirer/prompts')

vi.mock('../../../../cli-core/src/config/findProjectRoot.js', async () => {
  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock('../../../../cli-core/src/config/cli/getCliConfig.js', async () => {
  return {
    getCliConfig: vi.fn(),
  }
})

function mockUserApplicationsApi(options: {
  method?: 'DELETE' | 'GET'
  query?: Record<string, string>
  uri: string
}) {
  const {method = 'GET', query = {}, uri} = options
  const apiHost = 'https://api.sanity.io'
  const apiVersion = 'v2024-08-01'

  return nock(apiHost)
    [method.toLowerCase() as 'delete' | 'get'](`/${apiVersion}${uri}`)
    .query({tag: 'sanity.cli', ...query})
}

afterEach(() => {
  vi.clearAllMocks()
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#undeploy', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand(['undeploy', '--help'])

    expect(stdout).toContain('Removes the deployed Sanity Studio')
  })

  test('undeploys studio when studioHost is configured', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })

    mockUserApplicationsApi({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    mockUserApplicationsApi({
      method: 'DELETE',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('undeploys application when app id is configured', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {id: 'core-id'},
    })

    mockUserApplicationsApi({
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
    })

    mockUserApplicationsApi({
      method: 'DELETE',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('Application undeploy scheduled')
  })

  test('does nothing if no application found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })

    mockUserApplicationsApi({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(404)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if no application found (app config)', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {id: 'core-id'},
    })

    mockUserApplicationsApi({
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(404)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('Application with the given ID does not exist.')
    expect(stdout).toContain('Nothing to undeploy.')
  })

  test('does nothing if studioHost is missing', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
    })

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('No studio host provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if appId is missing', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {},
    })

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(stdout).toContain('No application ID provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does not undeploy if prompt is rejected', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })

    mockUserApplicationsApi({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    vi.mocked(confirm).mockResolvedValueOnce(false)

    await testCommand(UndeployCommand, [])

    // No delete call should be made since prompt was rejected
  })

  test('undeploys if prompt is accepted', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })

    mockUserApplicationsApi({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(200, {
      appHost: 'my-host',
      id: 'app-id',
    })

    mockUserApplicationsApi({
      method: 'DELETE',
      query: {appType: 'studio'},
      uri: '/user-applications/app-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [])

    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('undeploys app if prompt is accepted (app config)', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {id: 'core-id'},
    })

    mockUserApplicationsApi({
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
      title: 'core-app',
    })

    mockUserApplicationsApi({
      method: 'DELETE',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [])

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
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {id: 'core-id'},
    })

    mockUserApplicationsApi({
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200, {
      appHost: 'core-host',
      id: 'core-id',
      // title missing
    })

    mockUserApplicationsApi({
      method: 'DELETE',
      query: {appType: 'coreApp'},
      uri: '/user-applications/core-id',
    }).reply(200)

    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [])

    expect(stdout).toContain('Application undeploy scheduled')
    expect(stdout).toContain('your application')
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/\(untitled application\)/),
      }),
    )
  })

  test('handles generic errors', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })

    mockUserApplicationsApi({
      query: {appHost: 'my-host', appType: 'studio'},
      uri: '/projects/test/user-applications',
    }).reply(500, {message: 'Generic error'})

    const {error, stderr} = await testCommand(UndeployCommand, ['--yes'])

    expect(error?.message).toContain('Generic error')
    expect(stderr).toContain('Checking application info')
  })
})
