import {confirm} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {deleteUserApplication, getUserApplication} from '../../services/userApplications.js'
import {UndeployCommand} from '../undeploy.js'

vi.mock('@inquirer/prompts')
vi.mock('../../services/userApplications.js')

vi.mock(import('../../config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn(),
  }
})

afterEach(() => {
  vi.clearAllMocks()
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
    vi.mocked(getUserApplication).mockResolvedValueOnce({
      appHost: 'my-host',
      id: 'app-id',
    } as never)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(deleteUserApplication).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'app-id', appType: 'studio'}),
    )
    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('undeploys application when app id is configured', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {id: 'core-id'},
    })
    vi.mocked(getUserApplication).mockResolvedValueOnce({
      appHost: 'core-host',
      id: 'core-id',
    } as never)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(deleteUserApplication).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'core-id', appType: 'coreApp'}),
    )
    expect(stdout).toContain('Application undeploy scheduled')
  })

  test('does nothing if no application found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })
    vi.mocked(getUserApplication).mockResolvedValueOnce(null)

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(deleteUserApplication).not.toHaveBeenCalled()
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if studioHost is missing', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
    })

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(deleteUserApplication).not.toHaveBeenCalled()
    expect(stdout).toContain('No studio host provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does nothing if appId is missing', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      app: {},
    })

    const {stdout} = await testCommand(UndeployCommand, ['--yes'])

    expect(deleteUserApplication).not.toHaveBeenCalled()
    expect(stdout).toContain('No application ID provided')
    expect(stdout).toContain('Nothing to undeploy')
  })

  test('does not undeploy if prompt is rejected', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })
    vi.mocked(getUserApplication).mockResolvedValueOnce({
      appHost: 'my-host',
      id: 'app-id',
    } as never)
    vi.mocked(confirm).mockResolvedValueOnce(false)

    await testCommand(UndeployCommand, [])

    expect(deleteUserApplication).not.toHaveBeenCalled()
  })

  test('undeploys if prompt is accepted', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })
    vi.mocked(getUserApplication).mockResolvedValueOnce({
      appHost: 'my-host',
      id: 'app-id',
    } as never)
    vi.mocked(confirm).mockResolvedValueOnce(true)

    const {stdout} = await testCommand(UndeployCommand, [])

    expect(deleteUserApplication).toHaveBeenCalledWith(
      expect.objectContaining({applicationId: 'app-id', appType: 'studio'}),
    )
    expect(stdout).toContain('Studio undeploy scheduled')
  })

  test('handles generic errors', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId: 'test'},
      studioHost: 'my-host',
    })
    vi.mocked(getUserApplication).mockRejectedValueOnce(new Error('Generic error'))

    const {error, stderr} = await testCommand(UndeployCommand, ['--yes'])

    expect(error?.message).toContain('Generic error')
    expect(stderr).toContain('Checking application info')
  })
})
