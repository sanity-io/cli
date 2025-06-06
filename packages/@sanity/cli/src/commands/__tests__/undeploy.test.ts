import {runCommand} from '@oclif/test'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {
  deleteUserApplication,
  getUserApplication,
} from '../../services/userApplications.js'
import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {UndeployCommand} from '../undeploy.js'

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
      id: 'app-id',
      appHost: 'my-host',
    } as any)

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
      id: 'core-id',
      appHost: 'core-host',
    } as any)

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
})
