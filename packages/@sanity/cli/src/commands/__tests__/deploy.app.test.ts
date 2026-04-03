import {confirm, input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp} from '../../actions/build/buildApp.js'
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

vi.mock('../../actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('../../actions/manifest/extractAppManifest.js', () => ({
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

describe('#deploy app', () => {
  beforeEach(async () => {
    // Set up default mocks
    mockGetLocalPackageVersion.mockImplementation(async (moduleName) => {
      if (moduleName === 'sanity') return '3.0.0'
      if (moduleName === '@sanity/sdk-react') return '1.0.0'
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
    expect(error?.oclif?.exit).toBe(2)
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

  test('should PATCH user-application when manifest title differs from existing app title', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockExtractAppManifest.mockResolvedValue({
      title: 'New Title From Manifest',
      version: '1',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {appType: 'coreApp'},
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
      method: 'patch',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}`,
    }).reply(200, {
      appHost: 'existing-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: appId,
      organizationId: 'org-id',
      projectId: null,
      title: 'New Title From Manifest',
      type: 'coreApp',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}/deployments`,
    }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

    const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        ...defaultMocks,
        token: 'test-token',
      },
    })

    if (error) throw error
    expect(stdout).toContain('Updating title from "Existing App" to "New Title From Manifest"')
    expect(stderr).toContain('Updating application title')
    expect(stdout).toContain('Success! Application deployed')
  })

  test('does not PATCH when manifest title matches existing app title', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    const sameTitle = 'Test App'
    mockExtractAppManifest.mockResolvedValue({
      title: sameTitle,
      version: '1',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}`,
    }).reply(200, {
      appHost: 'existing-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: appId,
      organizationId: 'org-id',
      projectId: null,
      title: sameTitle,
      type: 'coreApp',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    // No PATCH mock - deploy should go straight to POST deployments
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}/deployments`,
    }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

    const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        ...defaultMocks,
        token: 'test-token',
      },
    })

    if (error) throw error
    expect(stderr).not.toContain('Updating application title')
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
    expect(error?.oclif?.exit).toBe(1)
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

    const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
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
    expect(stdout).toContain(`deployment: {\n  appId: '${newAppId}',`)
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Enter a title for your application:',
      validate: expect.any(Function),
    })

    // Verify the spinner is stopped before returning - a running spinner
    // blocks the subsequent input() prompt, causing the CLI to hang
    expect(stderr).toContain('No application ID configured')
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
    expect(error?.oclif?.exit).toBe(1)
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
    expect(stdout).toContain(`deployment: {\n  appId: '${existingAppId2}',`)
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
    expect(stdout).toContain(`deployment: {\n  appId: '${newAppId}',`)
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

    // Manifest title differs from existing app, so deploy PATCHes to update title
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'patch',
      query: {appType: 'coreApp'},
      uri: `/user-applications/${appId}`,
    }).reply(200, {
      appHost: 'existing-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: appId,
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
})
