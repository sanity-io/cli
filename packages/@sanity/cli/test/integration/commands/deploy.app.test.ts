import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {confirm, input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {unstable_defineApp} from '@sanity/workbench-cli'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp} from '../../../src/actions/build/buildApp.js'
import {checkDir} from '../../../src/actions/deploy/checkDir.js'
import {extractCoreAppManifest} from '../../../src/actions/manifest/extractCoreAppManifest.js'
import {DeployCommand} from '../../../src/commands/deploy.js'
import {USER_APPLICATIONS_API_VERSION} from '../../../src/services/userApplications.js'
import {dirIsEmptyOrNonExistent} from '../../../src/util/dirIsEmptyOrNonExistent.js'

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockCheckBuiltOutput = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getLocalPackageVersion: mockGetLocalPackageVersion,
  }
})

vi.mock('../../../src/actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

vi.mock('../../../src/actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

// `getWorkbench`/`assertDeployable` stay real — pure config the no-interfaces
// test exercises; only the fs-touching `checkBuiltOutput` is stubbed.
vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  checkBuiltOutput: mockCheckBuiltOutput,
}))

vi.mock(
  import('../../../src/actions/manifest/extractCoreAppManifest.js'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    extractCoreAppManifest: vi.fn(),
  }),
)

vi.mock(import('@sanity/cli-core/ux'), async (importOriginal) => ({
  ...(await importOriginal()),
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../../src/util/dirIsEmptyOrNonExistent.js', () => ({
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
const mockBuildApp = vi.mocked(buildApp)
const mockExtractCoreAppManifest = vi.mocked(extractCoreAppManifest)

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
  // Deploy treats a non-interactive terminal as unattended; these tests exercise
  // the interactive flows, so mark them interactive.
  isInteractive: true,
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
    mockCheckBuiltOutput.mockResolvedValue(undefined)
    // Default to empty manifest for app deployments
    mockExtractCoreAppManifest.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
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

  test('a dry run does not prompt to overwrite a non-empty output directory', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    // A dry run is a preview; it must not block on the interactive overwrite prompt.
    await testCommand(DeployCommand, ['build', '--dry-run', '--no-build'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    expect(mockConfirm).not.toHaveBeenCalled()
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

  test('should report the target and files in a dry run without deploying', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    await mkdir(join(cwd, 'dist'), {recursive: true})
    await writeFile(join(cwd, 'dist', 'index.html'), '<html></html>')

    // Read-only target lookup; no deployment POST is mocked, so a real ship
    // would fail nock — proving the dry run never mutates.
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

    const {error, stdout} = await testCommand(DeployCommand, ['--dry-run'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    if (error) throw error
    expect(stdout).toContain('Dry run — no changes made.')
    expect(stdout).toContain('Deploys to existing application "Existing App"')
    expect(stdout).toContain('This application can be deployed.')
    expect(stdout).toContain('Files to deploy (')
    expect(stdout).toContain('dist/index.html (')
    expect(stdout).not.toContain('Success! Application deployed')
  })

  test('should exit non-zero for a dry run that cannot deploy', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    // No organizationId configured → the target check fails, so the plan isn't
    // deployable and the dry run must exit non-zero (usable as a CI gate).
    const {error} = await testCommand(DeployCommand, ['--dry-run', '--no-build'], {
      config: {root: cwd},
      mocks: {cliConfig: {app: {}}},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.oclif?.exit).toBe(1)
    expect(error?.message).toContain('Deploy blocked')
  })

  test('should check the federation build dir for an unstable_defineApp app', async () => {
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

    const app = unstable_defineApp({
      entry: './src/App.tsx',
      name: 'workbench-app',
      organizationId,
      title: 'Workbench App',
    })

    const {error, stdout} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          app,
          deployment: {appId},
        },
      },
    })
    if (error) throw error

    expect(mockCheckBuiltOutput).toHaveBeenCalledWith(expect.any(String))
    expect(mockCheckDir).not.toHaveBeenCalled()
    expect(stdout).toContain('Success! Application deployed')
  })

  test('should reject an unstable_defineApp app that declares no interfaces', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    const app = unstable_defineApp({
      name: 'workbench-app',
      organizationId,
      title: 'Workbench App',
    })

    const {error} = await testCommand(DeployCommand, [], {
      config: {root: cwd},
      mocks: {
        cliConfig: {
          app,
          deployment: {appId},
        },
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('declares no entry, views or services')
    expect(error?.oclif?.exit).toBe(2)
    // fails before any directory check or API call
    expect(mockCheckBuiltOutput).not.toHaveBeenCalled()
    expect(mockCheckDir).not.toHaveBeenCalled()
  })

  test('should PATCH user-application when manifest title differs from existing app title', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockExtractCoreAppManifest.mockResolvedValue({
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
    mockExtractCoreAppManifest.mockResolvedValue({
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
        isInteractive: true,
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

  test('--yes errors instead of prompting to pick an existing application', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    // Existing apps but no configured appId → needs-input; unattended can't pick one.
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {appType: 'coreApp', organizationId},
      uri: `/user-applications`,
    }).reply(200, [
      {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'existing-app-id',
        organizationId,
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      },
    ])

    const {error} = await testCommand(DeployCommand, ['--yes'], {
      config: {root: cwd},
      mocks: {cliConfig: {app: {organizationId}}},
    })

    expect(error).toBeInstanceOf(Error)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('--yes errors instead of prompting for a new application title', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    // No existing apps and no appId → would-create; unattended can't prompt for a title.
    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {appType: 'coreApp', organizationId},
      uri: `/user-applications`,
    }).reply(200, [])

    const {error} = await testCommand(DeployCommand, ['--yes'], {
      config: {root: cwd},
      mocks: {cliConfig: {app: {organizationId}}},
    })

    expect(error).toBeInstanceOf(Error)
    expect(mockInput).not.toHaveBeenCalled()
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

    // The underlying checkDir failure surfaces verbatim
    expect(error?.message).toContain('Directory check failed')
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

    expect(error?.message).toContain('Failed to resolve deploy target')
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
      'Both `app.id` (deprecated) and `deployment.appId` are set: Remove `app.id` from sanity.cli.ts',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('a dry run also blocks when app.id and deployment.appId are both set', async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    // The dry run must surface the same conflict a real deploy fails on, rather
    // than reporting the app as deployable.
    const {error} = await testCommand(DeployCommand, ['--dry-run', '--no-build'], {
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

    expect(error).toBeInstanceOf(Error)
    expect(error?.oclif?.exit).toBe(1)
    expect(error?.message).toContain('Deploy blocked')
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

    // oclif wraps the warning at terminal width and prefixes continuation lines
    // (`›` on Unix, `»` on Windows); flatten before asserting the full copy
    const flatStderr = stderr.replaceAll(/\s*\n\s*[›»]?\s*/g, ' ')
    expect(flatStderr).toContain(
      'The `app.id` config is deprecated: Move it to `deployment.appId` in sanity.cli.ts',
    )
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
        isInteractive: true,
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
        isInteractive: true,
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
        isInteractive: true,
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
        isInteractive: true,
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

    mockExtractCoreAppManifest.mockResolvedValue(manifest)

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
    expect(mockExtractCoreAppManifest).toHaveBeenCalled()
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
        isInteractive: true,
      },
    })

    if (error) throw error

    expect(mockInput).toHaveBeenCalledWith({
      message: 'Enter a title for your application:',
      validate: expect.any(Function),
    })
  })
})
