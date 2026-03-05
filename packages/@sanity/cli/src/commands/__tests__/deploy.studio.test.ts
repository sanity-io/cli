import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildStudio} from '../../actions/build/buildStudio.js'
import {checkDir} from '../../actions/deploy/checkDir.js'
import {USER_APPLICATIONS_API_VERSION} from '../../services/userApplications.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {DeployCommand} from '../deploy.js'

vi.mock('../../util/getLocalPackageVersion.js')

vi.mock('../../actions/build/buildStudio.js', () => ({
  buildStudio: vi.fn(),
}))

vi.mock('../../actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    select: vi.fn(),
  }
})

vi.mock('../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: vi.fn(() => true),
}))

vi.mock('tar-fs', () => ({
  pack: vi.fn(() => {
    return {
      pipe: vi.fn(),
    }
  }),
}))

const mockSelect = vi.mocked(select)
const mockInput = vi.mocked(input)
const mockCheckDir = vi.mocked(checkDir)
const mockGetLocalPackageVersion = vi.mocked(getLocalPackageVersion)
const mockBuildStudio = vi.mocked(buildStudio)

describe('#deploy studio', () => {
  beforeEach(async () => {
    // Set up default mocks
    mockGetLocalPackageVersion.mockImplementation(async (moduleName) => {
      if (moduleName === 'sanity') return '3.0.0'
      return null
    })
    mockCheckDir.mockResolvedValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should handle missing sanity version', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    mockGetLocalPackageVersion.mockResolvedValue(null)

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          studioHost: 'existing-studio',
        },
      },
    })

    expect(error?.message).toContain('Failed to find installed sanity version')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle directory check errors', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'existing-studio'
    const studioAppId = 'studio-app-id'

    mockCheckDir.mockRejectedValue(new Error('Directory check failed'))

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'Existing Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    const {error} = await testCommand(DeployCommand, ['--no-build'], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    expect(error?.message).toContain('Error checking directory')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should re-deploy studio if it already exists', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'existing-studio'
    const studioAppId = 'studio-app-id'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'Existing Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: `https://${studioHost}.sanity.studio`})

    const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    if (error) throw error
    expect(stderr).toContain('Checking project info')
    expect(stderr).toContain('Verifying local content')
    expect(stderr).toContain('Deploying to sanity.studio')
    expect(stdout).toContain('Success! Studio deployed')
  })

  test('should create new studio hostname when studioHost is provided but does not exist', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: 'new-studio-host',
        appType: 'studio',
      },
      uri: `/projects/test-project-id/user-applications`,
    }).reply(404, {
      message: 'Not found',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/test-project-id/user-applications`,
    }).reply(200, {
      appHost: 'new-studio-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: 'new-studio-app-id',
      projectId: 'test-project-id',
      title: 'New Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/test-project-id/user-applications/new-studio-app-id/deployments`,
    }).reply(201, {id: 'deployment-id'}, {location: 'https://new-studio-host.sanity.studio'})

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId: 'test-project-id',
          },
          studioHost: 'new-studio-host',
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed')
    expect(stdout).toContain('Your project has not been assigned a studio hostname')
    expect(stdout).toContain('Creating https://new-studio-host.sanity.studio')
  })

  test('should handle studio hostname creation failure when name is taken', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'taken-studio-host'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(404, {
      message: 'Not found',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(409, {
      message: 'Studio hostname already taken',
      statusCode: 409,
    })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    expect(error?.message).toContain('Studio hostname already taken')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should allow selecting from existing studio hostnames', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'

    const studioOneId = 'studio-one-id'
    const studioTwoId = 'studio-two-id'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, [
      {
        appHost: 'studio-one',
        createdAt: '2024-01-01T00:00:00Z',
        id: studioOneId,
        projectId,
        title: 'Studio One',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      },
      {
        appHost: 'studio-two',
        createdAt: '2024-01-01T00:00:00Z',
        id: studioTwoId,
        projectId,
        title: 'Studio Two',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      },
    ])

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioTwoId}/deployments`,
    }).reply(
      201,
      {id: deploymentId, location: 'https://studio-two.sanity.studio'},
      {location: 'https://studio-two.sanity.studio'},
    )

    mockSelect.mockResolvedValue('studio-two')

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed to https://studio-two.sanity.studio')
    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Create new studio hostname', value: 'NEW_STUDIO'},
        expect.any(Object), // Separator
        {name: 'Studio One', value: 'studio-one'},
        {name: 'Studio Two', value: 'studio-two'},
      ],
      message: 'Select existing studio hostname, or create a new one',
    })
  })

  test('should allow creating new studio hostname from selection menu', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const existingStudioId = 'existing-studio-id'
    const newStudioFromMenuId = 'new-studio-from-menu-id'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    })
      .once()
      .reply(200, [
        {
          appHost: 'existing-studio',
          createdAt: '2024-01-01T00:00:00Z',
          id: existingStudioId,
          projectId,
          title: 'Existing Studio',
          type: 'studio',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
      ])

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: 'new-studio-from-menu',
      createdAt: '2024-01-01T00:00:00Z',
      id: newStudioFromMenuId,
      projectId,
      title: 'New Studio From Menu',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${newStudioFromMenuId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: 'https://new-studio-from-menu.sanity.studio'})

    mockSelect.mockResolvedValue('NEW_STUDIO')
    mockInput.mockImplementation(({validate}) => {
      const promise = (async () => {
        if (validate) {
          await validate('new-studio-from-menu')
        }
        return 'new-studio-from-menu'
      })() as Promise<string> & {cancel: () => void}

      promise.cancel = () => {}
      return promise
    })

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed')
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Studio hostname (<value>.sanity.studio):',
      validate: expect.any(Function),
    })
  })

  test('should handle input validation with retry for studio hostname creation', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const validStudioId = 'valid-studio-id'
    const deploymentId = 'deployment-id'

    mockInput.mockImplementation(({validate}) => {
      const promise = (async () => {
        if (validate) {
          // First attempt with a name that will be taken (triggers 409)
          let result = await validate('taken-name')
          if (result !== true) {
            // Name was taken, try again with a valid name (triggers 200)
            result = await validate('valid-name')
          }
        }
        return 'valid-name'
      })() as Promise<string> & {cancel: () => void}

      promise.cancel = () => {}
      return promise
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, [])

    // First API call fails (hostname taken)
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    })
      .once()
      .reply(409, {
        message: 'Studio hostname already taken',
        statusCode: 409,
      })

    // Second API call succeeds
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    })
      .once()
      .reply(200, {
        appHost: 'valid-name',
        createdAt: '2024-01-01T00:00:00Z',
        id: validStudioId,
        projectId,
        title: 'Valid Studio',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${validStudioId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: 'https://valid-name.sanity.studio'})

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed')
  })

  test('should handle input validation fails with unknown error', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'

    mockInput.mockImplementation(({validate}) => {
      const promise = (async () => {
        if (validate) {
          // First attempt with a name that will be taken (triggers 409)
          let result = await validate('taken-name')
          if (result !== true) {
            // Name was taken, try again with a valid name (triggers 200)
            result = await validate('valid-name')
          }
        }
        return 'valid-name'
      })() as Promise<string> & {cancel: () => void}

      promise.cancel = () => {}
      return promise
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, [])

    // First API call fails (hostname taken)
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    })
      .once()
      .reply(500, {
        message: 'Internal server error',
        statusCode: 500,
      })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
        },
      },
    })

    expect(error?.message).toContain('Error creating user application')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should throw error when no projectId is configured', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {},
          studioHost: 'some-studio',
        },
      },
    })

    expect(error?.message).toContain(
      'sanity.cli.ts does not contain a project identifier ("api.projectId"), which is required for the Sanity CLI to communicate with the Sanity API',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should log a warning if the deprecated auto-updates flag is used', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'test-studio'
    const studioAppId = 'studio-app-id'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'Test Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: `https://${studioHost}.sanity.studio`})

    const {error, stderr} = await testCommand(DeployCommand, ['--auto-updates'], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    if (error) throw error
    expect(stderr).toContain('Warning: The --auto-updates flag is deprecated')
  })

  test('should throw an error when both the current and deprecated autoUpdates config are used', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          autoUpdates: true,
          deployment: {
            autoUpdates: true,
          },
        },
      },
    })

    expect(error?.message).toContain(
      'Found both `autoUpdates` (deprecated) and `deployment.autoUpdates` in sanity.cli.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle general API errors when finding user application', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'existing-studio'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(500, {
      error: 'Internal server error',
    })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    expect(error?.message).toContain('Error finding user application')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle deployment API errors for studio', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'existing-studio'
    const studioAppId = 'studio-app-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'Existing Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(500, {
      error: 'Internal server error',
    })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    expect(error?.message).toContain('Error deploying studio')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle fatal errors during studio hostname creation', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'new-studio-host'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(404, {
      message: 'Not found',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(500, {
      message: 'Internal server error',
      statusCode: 500,
    })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    expect(error?.message).toContain('Error creating user application from config')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle no existing studio applications scenario', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const newStudioId = 'new-studio-id'
    const deploymentId = 'deployment-id'

    mockInput.mockImplementation(({validate}) => {
      const promise = (async () => {
        if (validate) {
          await validate('new-studio-name')
        }
        return 'new-studio-name'
      })() as Promise<string> & {cancel: () => void}

      promise.cancel = () => {}
      return promise
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, [])

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: 'new-studio-name',
      createdAt: '2024-01-01T00:00:00Z',
      id: newStudioId,
      projectId,
      title: 'New Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${newStudioId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: `https://new-studio-name.sanity.studio`})

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed')
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Studio hostname (<value>.sanity.studio):',
      validate: expect.any(Function),
    })
  })

  test('should skip build when --no-build flag is used for studio', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioHost = 'existing-studio'
    const studioAppId = 'studio-app-id'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appHost: studioHost,
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'Existing Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(201, {id: deploymentId}, {location: `https://${studioHost}.sanity.studio`})

    const {error, stdout} = await testCommand(DeployCommand, ['--no-build'], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          studioHost,
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain('Success! Studio deployed')
    expect(mockBuildStudio).not.toHaveBeenCalled()
  })

  test('should deploy studio using deployment.appId', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioAppId = 'studio-app-id'
    const appHost = 'my-studio'
    const deploymentId = 'deployment-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      uri: `/projects/${projectId}/user-applications/${studioAppId}`,
    }).reply(200, {
      appHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'My Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(
      201,
      {id: deploymentId, location: `https://${appHost}.sanity.studio`},
      {location: `https://${appHost}.sanity.studio`},
    )

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          deployment: {
            appId: studioAppId,
          },
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain(`Success! Studio deployed to https://${appHost}.sanity.studio`)
  })

  test('should prioritize deployment.appId over studioHost when both are configured', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioAppId = 'studio-app-id'
    const studioHost = 'my-studio-host'
    const deploymentId = 'deployment-id'

    // Should call by appId, NOT by appHost
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      uri: `/projects/${projectId}/user-applications/${studioAppId}`,
    }).reply(200, {
      appHost: studioHost,
      createdAt: '2024-01-01T00:00:00Z',
      id: studioAppId,
      projectId,
      title: 'My Studio',
      type: 'studio',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'studio',
      },
      uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
    }).reply(
      201,
      {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
      {location: `https://${studioHost}.sanity.studio`},
    )

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          deployment: {
            appId: studioAppId,
          },
          studioHost,
        },
      },
    })

    if (error) throw error
    expect(stdout).toContain(`Success! Studio deployed to https://${studioHost}.sanity.studio`)
  })

  test('should error when deployment.appId does not exist and not fall back to studioHost', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioAppId = 'non-existent-app-id'

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      uri: `/projects/${projectId}/user-applications/${studioAppId}`,
    }).reply(404, {
      message: 'Application not found',
    })

    // studioHost is configured but should NOT be used as fallback.
    // If it were, nock's pending-mocks check in afterEach would catch the extra request.
    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          api: {
            projectId,
          },
          deployment: {
            appId: studioAppId,
          },
          studioHost: 'valid-studio-host',
        },
      },
    })

    expect(error?.message).toContain('Error finding user application')
    expect(error?.message).toContain(`Cannot find app with app ID ${studioAppId}`)
    expect(error?.oclif?.exit).toBe(1)
  })
})
