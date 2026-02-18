import {confirm, input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp} from '../../actions/build/buildApp.js'
import {buildStudio} from '../../actions/build/buildStudio.js'
import {checkDir} from '../../actions/deploy/checkDir.js'
import {extractAppManifest} from '../../actions/manifest/extractAppManifest.js'
import {USER_APPLICATIONS_API_VERSION} from '../../services/userApplications.js'
import {dirIsEmptyOrNonExistent} from '../../util/dirIsEmptyOrNonExistent.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {DeployCommand} from '../deploy.js'

vi.mock('../../util/getLocalPackageVersion.js')

vi.mock('../../actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

vi.mock('../../actions/build/buildStudio.js', () => ({
  buildStudio: vi.fn(),
}))

vi.mock('../../actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('../../actions/manifest/extractAppManifest.js', () => ({
  appManifestHasData: vi.fn(),
  extractAppManifest: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
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
const mockConfirm = vi.mocked(confirm)
const mockInput = vi.mocked(input)
const mockCheckDir = vi.mocked(checkDir)
const mockDirIsEmptyOrNonExistent = vi.mocked(dirIsEmptyOrNonExistent)
const mockGetLocalPackageVersion = vi.mocked(getLocalPackageVersion)
const mockBuildStudio = vi.mocked(buildStudio)
const mockBuildApp = vi.mocked(buildApp)
const mockExtractAppManifest = vi.mocked(extractAppManifest)

const appId = 'app-id'
const organizationId = 'org-id'

const defaultMocks = {
  cliConfig: {
    app: {
      organizationId,
    },
    deployment: {
      appId,
    },
  },
}

describe('#deploy', () => {
  beforeEach(async () => {
    // Set up default mocks
    mockGetLocalPackageVersion.mockImplementation(async (moduleName) => {
      if (moduleName === 'sanity') return '3.0.0' // for studio deployments
      if (moduleName === '@sanity/sdk-react') return '1.0.0' // for app deployments
      return null
    })
    mockCheckDir.mockResolvedValue()
    // Default to empty manifest for app deployments
    mockExtractAppManifest.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DeployCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test("should prompt to confirm deleting source directory if it's not empty", async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(true)
    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'coreApp',
      },
      uri: `/user-applications/${appId}`,
    }).reply(200, {
      appHost: 'existing-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: appId,
      organizationId: 'org-id',
      projectId: null,
      title: 'Existing App',
      type: 'coreApp',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'coreApp',
      },
      uri: `/user-applications/${appId}/deployments`,
    }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message: '"./build" is not empty, do you want to proceed?',
    })
  })

  test("should cancel the deployment if the user doesn't want to proceed", async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Cancelled.')
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('app', () => {
    test('should re-deploy app if it already exists', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: appId,
        organizationId: 'org-id',
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}/deployments`,
      }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

      const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: defaultMocks,
      })
      if (error) throw error

      expect(stderr).toContain('Checking application info')
      expect(stderr).toContain('Verifying local content')
      expect(stderr).toContain('Deploying...')

      expect(stdout).toContain('Success! Application deployed')
    })

    test('should handle missing @sanity/sdk-react version', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      mockGetLocalPackageVersion.mockResolvedValue(null)

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Failed to find installed @sanity/sdk-react version')
    })

    test('should create new user application if none exists', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const newAppId = 'new-app-id'
      const deploymentId = 'deployment-id'

      mockInput.mockResolvedValue('Test App')

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: newAppId,
        organizationId,
        projectId: null,
        title: 'Test App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${newAppId}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://generated-host.sanity.app/'})

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain(
        `Add the deployment.appId to your sanity.cli.js or sanity.cli.ts file:`,
      )
      expect(stdout).toContain(`deployment: {
  appId: '${newAppId}',`)
      expect(mockInput).toHaveBeenCalledWith({
        message: 'Enter a title for your application:',
        validate: expect.any(Function),
      })
    })

    test('should skip build when --no-build flag is used', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId = 'existing-app-id'
      const deploymentId = 'deployment-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: existingAppId,
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://existing-host.sanity.app/'})

      const {error, stdout} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: existingAppId,
            },
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(mockBuildApp).not.toHaveBeenCalled()
    })

    test('should handle directory check errors', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId = 'existing-app-id'

      mockCheckDir.mockRejectedValue(new Error('Directory check failed'))

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: existingAppId,
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: existingAppId,
            },
          },
        },
      })

      expect(error?.message).toContain('Error checking directory')
      expect(error?.oclif?.exit).toBe(1)
    })

    test("should error when fetching user applications if user doesn't have org access", async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const anotherAppId = 'some-app-id'
      const anotherOrganizationId = 'org-without-access'

      // Simulate API returning 403 Forbidden for the given org
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${anotherAppId}`,
      }).reply(403, {
        error: 'Forbidden',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId: anotherOrganizationId,
            },
            deployment: {
              appId: anotherAppId,
            },
          },
        },
      })

      expect(error?.message).toContain(
        `You don’t have permission to view applications for the configured organization ID ("${anotherOrganizationId}")`,
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should handle user-applications endpoint errors', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId = 'existing-app-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: existingAppId,
            },
          },
        },
      })

      expect(error?.message).toContain('Error deploying application')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should handle deployment API errors', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId = 'existing-app-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: existingAppId,
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}/deployments`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: existingAppId,
            },
          },
        },
      })

      expect(error?.message).toContain('Error deploying application')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should show an error if deployment.appId is configured but the application does not exist', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const nonExistentAppId = 'non-existent-app-id'

      // Simulate API returning no user application for the given app.id
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${nonExistentAppId}`,
      }).reply(404, {
        error: 'Not found',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: nonExistentAppId,
            },
          },
        },
      })

      expect(error?.message).toContain(
        'The `appId` provided in your configuration’s `deployment` object cannot be found in your organization',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should show an error if deployment.appId and app.id (deprecated) are both in use', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            app: {
              id: appId,
              organizationId,
            },
          },
        },
      })

      expect(error?.message).toContain(
        'Found both app.id (deprecated) and deployment.appId in your application configuration.\n\nPlease remove app.id from your sanity.cli.js or sanity.cli.ts file.',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should show a warning if app.id (deprecated) is used', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {stderr} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              id: appId,
              organizationId,
            },
          },
        },
      })

      expect(stderr).toContain('The `app.id` config has moved to `deployment.appId`.')
    })

    test('should handle app creation with retry when host is taken', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const newAppId = 'new-app-id'
      const deploymentId = 'deployment-id'

      mockInput.mockResolvedValue('Test App')

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      })
        .once()
        .reply(409, {
          message: 'App host already taken',
          statusCode: 409,
        })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      })
        .once()
        .reply(200, {
          appHost: 'generated-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: newAppId,
          organizationId,
          projectId: null,
          title: 'Test App',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${newAppId}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://generated-host-2.sanity.app/'})

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
    })

    test('should handle app creation failure with non-retryable error', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      mockInput.mockResolvedValue('Test App')

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(500, {
        message: 'Internal server error',
        statusCode: 500,
      })

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should handle findUserApplicationForApp API errors', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId = 'existing-app-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId}`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            ...defaultMocks.cliConfig,
            deployment: {
              appId: existingAppId,
            },
          },
        },
      })

      expect(error?.message).toContain('Error deploying application')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should test input validation for app title', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const newAppId = 'new-app-id'
      const deploymentId = 'deployment-id'

      mockInput.mockResolvedValue('Valid App Title')

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: newAppId,
        organizationId,
        projectId: null,
        title: 'Valid App Title',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${newAppId}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://generated-host.sanity.app/'})

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      if (error) throw error

      expect(mockInput).toHaveBeenCalledWith({
        message: 'Enter a title for your application:',
        validate: expect.any(Function),
      })
    })

    test('should allow selecting from list of apps', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId1 = 'existing-app-id-1'
      const existingAppId2 = 'existing-app-id-2'
      const deploymentId = 'deployment-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [
        {
          appHost: 'existing-host-1',
          createdAt: '2024-01-01T00:00:00Z',
          id: existingAppId1,
          organizationId,
          projectId: null,
          title: 'Existing App 1',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
        {
          appHost: 'existing-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: existingAppId2,
          organizationId,
          projectId: null,
          title: 'Existing App 2',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
      ])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${existingAppId2}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://existing-host-2.sanity.app/'})

      mockSelect.mockResolvedValue('existing-host-2')

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain(
        `Add the deployment.appId to your sanity.cli.js or sanity.cli.ts file:`,
      )
      expect(stdout).toContain(`deployment: {
  appId: '${existingAppId2}',`)
    })

    test('should allow creating a new app by selecting from list of apps', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const existingAppId1 = 'existing-app-id-1'
      const existingAppId2 = 'existing-app-id-2'
      const newAppId = 'new-app-id'
      const deploymentId = 'deployment-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, [
        {
          appHost: 'existing-host-1',
          createdAt: '2024-01-01T00:00:00Z',
          id: existingAppId1,
          organizationId,
          projectId: null,
          title: 'Existing App 1',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
        {
          appHost: 'existing-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: existingAppId2,
          organizationId,
          projectId: null,
          title: 'Existing App 2',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
      ])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId,
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: newAppId,
        organizationId,
        projectId: null,
        title: 'Test App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${newAppId}/deployments`,
      }).reply(201, {id: deploymentId}, {location: 'https://generated-host.sanity.app/'})

      mockSelect.mockResolvedValue('NEW_APP')

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId,
            },
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain(
        `Add the deployment.appId to your sanity.cli.js or sanity.cli.ts file:`,
      )
      expect(stdout).toContain(`deployment: {
  appId: '${newAppId}',`)
    })

    test('should throw an error if organizationId is not set', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            app: {
              organizationId: undefined,
            },
          },
        },
      })

      expect(error?.message).toContain(
        'sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required for the Sanity CLI to communicate with the Sanity API',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should deploy app with manifest when manifest is provided', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const manifest = {
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
        title: 'Test App',
        version: '1' as const,
      }

      mockExtractAppManifest.mockResolvedValue(manifest)

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: appId,
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}/deployments`,
      }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(mockExtractAppManifest).toHaveBeenCalled()
    })

    test('should deploy app without manifest when manifest is empty', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      // Return an empty manifest object
      mockExtractAppManifest.mockResolvedValue(undefined)

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: appId,
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/${appId}/deployments`,
      }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(stdout).toContain('Success! Application deployed')
      expect(mockExtractAppManifest).toHaveBeenCalled()
    })
  })

  describe('studio', () => {
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
    })

    test('should handle directory check errors', async () => {
      const cwd = await testFixture('basic-app')
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

      const {stderr} = await testCommand(DeployCommand, ['--auto-updates'], {
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
  })
})
