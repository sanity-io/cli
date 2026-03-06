import {getCliTelemetry, studioWorkerTask} from '@sanity/cli-core'
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

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliTelemetry: vi.fn().mockReturnValue({
      trace: vi.fn().mockReturnValue({
        complete: vi.fn(),
        error: vi.fn(),
        start: vi.fn(),
      }),
    }),
    studioWorkerTask: vi.fn(),
  }
})

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

const mockStudioWorkerTask = vi.mocked(studioWorkerTask)
const mockGetCliTelemetry = vi.mocked(getCliTelemetry)
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
    mockStudioWorkerTask.mockResolvedValue({
      studioManifest: {
        buildId: '"test-build-id"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'test',
            name: 'default',
            projectId: 'test-project-id',
            schemaDescriptorId: 'test-descriptor',
            title: 'Test',
          },
        ],
      },
      type: 'success',
    })
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
    }).reply(
      201,
      {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
      {location: `https://${studioHost}.sanity.studio`},
    )

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
    }).reply(
      201,
      {id: 'deployment-id', location: 'https://new-studio-host.sanity.studio'},
      {location: 'https://new-studio-host.sanity.studio'},
    )

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
    }).reply(
      201,
      {id: deploymentId, location: 'https://new-studio-from-menu.sanity.studio'},
      {location: 'https://new-studio-from-menu.sanity.studio'},
    )

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
    }).reply(
      201,
      {id: deploymentId, location: 'https://valid-name.sanity.studio'},
      {location: 'https://valid-name.sanity.studio'},
    )

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
    }).reply(
      201,
      {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
      {location: `https://${studioHost}.sanity.studio`},
    )

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
    }).reply(
      201,
      {id: deploymentId, location: `https://new-studio-name.sanity.studio`},
      {location: `https://new-studio-name.sanity.studio`},
    )

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
    }).reply(
      201,
      {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
      {location: `https://${studioHost}.sanity.studio`},
    )

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

  test('should handle error when deployment.appId does not exist for the org', async () => {
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
        },
      },
    })

    expect(error?.message).toContain('Error finding user application')
    expect(error?.message).toContain(`Cannot find app with app ID ${studioAppId}`)
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('external', () => {
    test('should register external studio with studioHost URL', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
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
        title: 'External Studio',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'external',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: studioHost}, {location: studioHost})

      const {error, stderr, stdout} = await testCommand(DeployCommand, ['--external'], {
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
      expect(stderr).toContain('Registering studio')
      expect(stdout).toContain('Success! Studio registered')
      expect(mockCheckDir).not.toHaveBeenCalled()
      expect(mockBuildStudio).not.toHaveBeenCalled()
    })

    test('should create external studio when studioHost URL does not exist', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'https://studio.example.com'
      const studioAppId = 'new-external-app-id'
      const deploymentId = 'deployment-id'

      // First lookup returns 404
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appHost: studioHost,
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(404, {message: 'Not found'})

      // Create the external app
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: studioHost,
        createdAt: '2024-01-01T00:00:00Z',
        id: studioAppId,
        projectId,
        title: 'External Studio',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'external',
      })

      // Deploy
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: studioHost}, {location: studioHost})

      const {error, stdout} = await testCommand(DeployCommand, ['--external'], {
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
      expect(stdout).toContain('Registering')
      expect(stdout).toContain('Success! Studio registered')
    })

    test('should prompt for external URL when no studioHost configured', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const externalUrl = 'https://studio.example.com'
      const studioAppId = 'prompted-external-id'
      const deploymentId = 'deployment-id'

      // No apps exist for this project
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      })
        .once()
        .reply(200, [])

      // Create the external app via prompt
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: externalUrl,
        createdAt: '2024-01-01T00:00:00Z',
        id: studioAppId,
        projectId,
        title: null,
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'external',
      })

      // Deploy
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: externalUrl}, {location: externalUrl})

      mockInput.mockImplementation(({validate}) => {
        const promise = (async () => {
          if (validate) {
            await validate(externalUrl)
          }
          return externalUrl
        })() as Promise<string> & {cancel: () => void}

        promise.cancel = () => {}
        return promise
      })

      const {error, stdout} = await testCommand(DeployCommand, ['--external'], {
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
      expect(stdout).toContain('Please enter the full URL where your studio is hosted')
      expect(stdout).toContain('Success! Studio registered')
      expect(mockInput).toHaveBeenCalledWith({
        message: 'Studio URL (https://...):',
        validate: expect.any(Function),
      })
    })

    test('should filter apps by urlType when listing external studios', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const externalUrl = 'https://studio.example.com'
      const externalAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

      // Return mixed apps — both internal and external
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
            appHost: 'internal-studio',
            createdAt: '2024-01-01T00:00:00Z',
            id: 'internal-app-id',
            projectId,
            title: 'Internal Studio',
            type: 'studio',
            updatedAt: '2024-01-01T00:00:00Z',
            urlType: 'internal',
          },
          {
            appHost: externalUrl,
            createdAt: '2024-01-01T00:00:00Z',
            id: externalAppId,
            projectId,
            title: 'External Studio',
            type: 'studio',
            updatedAt: '2024-01-01T00:00:00Z',
            urlType: 'external',
          },
        ])

      // Deploy
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications/${externalAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: externalUrl}, {location: externalUrl})

      // User selects the external studio from filtered list
      mockSelect.mockResolvedValue(externalUrl)

      const {error, stdout} = await testCommand(DeployCommand, ['--external'], {
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
      expect(stdout).toContain('Success! Studio registered')
      // Verify select was called with external-specific messaging
      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select existing external studio, or register a new one',
        }),
      )
      // Verify only external apps were shown (not internal)
      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({name: 'External Studio', value: externalUrl}),
          ]),
        }),
      )
      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.not.arrayContaining([expect.objectContaining({name: 'Internal Studio'})]),
        }),
      )
    })

    test('should normalize external URL with trailing slash', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'https://studio.example.com/'
      const normalizedUrl = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

      // Lookup with normalized URL
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appHost: normalizedUrl,
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: normalizedUrl,
        createdAt: '2024-01-01T00:00:00Z',
        id: studioAppId,
        projectId,
        title: 'External Studio',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'external',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: normalizedUrl}, {location: normalizedUrl})

      const {error, stdout} = await testCommand(DeployCommand, ['--external'], {
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
      expect(stdout).toContain('Success! Studio registered')
    })

    test('should reject invalid external URL in studioHost', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'

      const {error} = await testCommand(DeployCommand, ['--external'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {
              projectId,
            },
            studioHost: 'ftp://invalid.com',
          },
        },
      })

      expect(error?.message).toContain('URL must use http or https protocol')
    })
  })

  test('should not fall back to studioHost when deployment.appId is configured but does not exist', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    const projectId = 'test-project-id'
    const studioAppId = 'non-existent-app-id'
    const studioHost = 'valid-studio-host'

    // appId lookup fails
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      uri: `/projects/${projectId}/user-applications/${studioAppId}`,
    }).reply(404, {
      message: 'Application not found',
    })

    // Should NOT make a call to studioHost - if it does, this mock will remain unused
    // and cause the test to fail due to pending mocks check

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
          studioHost, // This should NOT be used as fallback
        },
      },
    })

    expect(error?.message).toContain('Error finding user application')
    expect(error?.message).toContain(`Cannot find app with app ID ${studioAppId}`)
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('schema and manifest deployment', () => {
    test('should handle worker error with SchemaExtractionError', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'existing-studio'
      const studioAppId = 'studio-app-id'

      mockStudioWorkerTask.mockResolvedValue({
        error: 'Schema validation failed',
        type: 'error',
        validation: [
          {
            path: [{kind: 'type', name: 'post', type: 'document'}],
            problems: [{message: 'Missing title', severity: 'error'}],
          },
        ],
      })

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

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      expect(error?.message).toContain('Missing title')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should handle worker generic error', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'existing-studio'
      const studioAppId = 'studio-app-id'

      mockStudioWorkerTask.mockRejectedValue(new Error('worker crashed'))

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

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      expect(error?.message).toContain('Error deploying studio schemas and manifests')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should handle null studioManifest from worker', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'existing-studio'
      const studioAppId = 'studio-app-id'

      mockStudioWorkerTask.mockResolvedValue({
        studioManifest: null,
        type: 'success',
      })

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

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      expect(error?.message).toContain('Failed to generate studio manifest')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should pass --schema-required flag to worker', async () => {
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
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(
        201,
        {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
        {location: `https://${studioHost}.sanity.studio`},
      )

      const {error} = await testCommand(DeployCommand, ['--schema-required'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      if (error) throw error
      expect(mockStudioWorkerTask).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          workerData: expect.objectContaining({
            schemaRequired: true,
          }),
        }),
      )
    })

    test('should pass --verbose flag to worker', async () => {
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
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(
        201,
        {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
        {location: `https://${studioHost}.sanity.studio`},
      )

      const {error} = await testCommand(DeployCommand, ['--verbose'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      if (error) throw error
      expect(mockStudioWorkerTask).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          workerData: expect.objectContaining({
            verbose: true,
          }),
        }),
      )
    })

    test('should pass isExternal to worker for external deploy', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
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
        title: 'External Studio',
        type: 'studio',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'external',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: studioHost}, {location: studioHost})

      const {error} = await testCommand(DeployCommand, ['--external'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      if (error) throw error
      expect(mockStudioWorkerTask).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          workerData: expect.objectContaining({
            isExternal: true,
          }),
        }),
      )
      expect(mockBuildStudio).not.toHaveBeenCalled()
      expect(mockCheckDir).not.toHaveBeenCalled()
    })

    test('should call build and checkDir for internal deploy', async () => {
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
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(
        201,
        {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
        {location: `https://${studioHost}.sanity.studio`},
      )

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      if (error) throw error
      expect(mockBuildStudio).toHaveBeenCalled()
      expect(mockCheckDir).toHaveBeenCalled()
    })

    test('should use telemetry tracing for schema deployment', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const studioHost = 'existing-studio'
      const studioAppId = 'studio-app-id'
      const deploymentId = 'deployment-id'

      const mockTrace = {
        complete: vi.fn(),
        error: vi.fn(),
        start: vi.fn(),
      }
      mockGetCliTelemetry.mockReturnValue({
        trace: vi.fn().mockReturnValue(mockTrace),
      } as never)

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
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(
        201,
        {id: deploymentId, location: `https://${studioHost}.sanity.studio`},
        {location: `https://${studioHost}.sanity.studio`},
      )

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost,
          },
        },
      })

      if (error) throw error
      expect(mockTrace.start).toHaveBeenCalled()
      expect(mockTrace.complete).toHaveBeenCalled()
    })
  })
})
