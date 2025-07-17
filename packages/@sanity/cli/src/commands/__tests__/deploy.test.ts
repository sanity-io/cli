import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {confirm, select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mockApi} from '~test/helpers/mockApi.js'
import {testCommand} from '~test/helpers/testCommand.js'

import {checkDir} from '../../actions/deploy/checkDir.js'
import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {USER_APPLICATIONS_API_VERSION} from '../../services/userApplications.js'
import {dirIsEmptyOrNonExistent} from '../../util/dirIsEmptyOrNonExistent.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {DeployCommand} from '../deploy.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '../../../../../../')
const examplesDir = resolve(rootDir, 'examples')

vi.mock('../../config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../util/readModuleVersion.js', () => ({
  readModuleVersion: vi.fn(),
}))

vi.mock('../../actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

vi.mock('../../actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
  Separator: vi.fn(),
}))

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

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockSelect = vi.mocked(select)
const mockConfirm = vi.mocked(confirm)
const mockDirIsEmptyOrNonExistent = vi.mocked(dirIsEmptyOrNonExistent)

describe('#deploy', () => {
  beforeEach(async () => {
    // Set up default mocks
    vi.mocked(readModuleVersion).mockResolvedValue('1.0.0')
    vi.mocked(checkDir).mockResolvedValue()
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('deploy --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Builds and deploys Sanity Studio or application to Sanity hosting

      USAGE
        $ sanity deploy [SOURCEDIR] [--auto-updates] [--build] [--minify]
          [--schema-required] [--source-maps] [--verbose] [-y]

      ARGUMENTS
        SOURCEDIR  Source directory

      FLAGS
        -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt
                                 and otherwise uses defaults
            --[no-]auto-updates  Automatically update the studio to the latest version
            --[no-]build         Don't build the studio prior to deploy, instead
                                 deploying the version currently in \`dist/\`
            --[no-]minify        Skip minifying built JavaScript (speeds up build,
                                 increases size of bundle)
            --schema-required    Fail-fast deployment if schema store fails
            --source-maps        Enable source maps for built bundles (increases size
                                 of bundle)
            --verbose            Enable verbose logging

      DESCRIPTION
        Builds and deploys Sanity Studio or application to Sanity hosting

      EXAMPLES
        Build the studio

          $ sanity deploy

        Deploys non-minified build with source maps

          $ sanity deploy --no-minify --source-maps

        Fail fast on schema store fails - for when other services rely on the stored
        schema

          $ sanity deploy --schema-required

      "
    `)
  })
  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DeployCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test("should prompt to confirm deleting source directory if it's not empty", async () => {
    const cwd = join(examplesDir, 'basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(true)
    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    const appId = 'app-id'

    mockGetCliConfig.mockResolvedValue({
      app: {
        id: appId,
        organizationId: 'org-id',
      },
    })

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
    }).reply(200, {
      id: 'deployment-id',
    })

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message: '"./build" is not empty, do you want to proceed?',
    })
  })

  test("should cancel the deployment if the user doesn't want to proceed", async () => {
    const cwd = join(examplesDir, 'basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(false)

    const appId = 'app-id'

    mockGetCliConfig.mockResolvedValue({
      app: {
        id: appId,
        organizationId: 'org-id',
      },
    })

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
    })

    expect(error?.message).toContain('Cancelled.')
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('app', () => {
    test('should re-deploy app if it already exists', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const appId = 'app-id'

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: appId,
          organizationId: 'org-id',
        },
      })

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
      }).reply(200, {
        id: 'deployment-id',
      })

      const {error, stderr, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()

      expect(stderr).toContain('Checking application info')
      expect(stderr).toContain('Verifying local content')
      expect(stderr).toContain('Deploying...')

      expect(stdout).toContain('Success! Application deployed')
    })

    test('should handle missing @sanity/sdk-react version', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {readModuleVersion} = await import('../../util/readModuleVersion.js')
      vi.mocked(readModuleVersion).mockResolvedValue(null)

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'app-id',
          organizationId: 'org-id',
        },
      })

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Failed to find installed @sanity/sdk-react version')
    })

    test('should create new user application if none exists', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {input} = await import('@inquirer/prompts')
      vi.mocked(input).mockResolvedValue('Test App')

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'new-app-id',
        organizationId: 'org-id',
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
        uri: `/user-applications/new-app-id/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain("Add id: 'new-app-id'")
      expect(stdout).toContain('to `app` in sanity.cli.js or sanity.cli.ts')
      expect(vi.mocked(input)).toHaveBeenCalledWith({
        message: 'Enter a title for your application:',
        validate: expect.any(Function),
      })
    })

    test('should skip build when --no-build flag is used', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {buildApp} = await import('../../actions/build/buildApp.js')

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'existing-app-id',
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/existing-app-id`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'existing-app-id',
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
        uri: `/user-applications/existing-app-id/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      const {error, stdout} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Success! Application deployed')
      expect(vi.mocked(buildApp)).not.toHaveBeenCalled()
    })

    test('should handle directory check errors', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {checkDir} = await import('../../actions/deploy/checkDir.js')

      vi.mocked(checkDir).mockRejectedValue(new Error('Directory check failed'))

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'existing-app-id',
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/existing-app-id`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'existing-app-id',
        organizationId: 'org-id',
        projectId: null,
        title: 'Existing App',
        type: 'coreApp',
        updatedAt: '2024-01-01T00:00:00Z',
        urlType: 'internal',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should handle general deployment errors', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'existing-app-id',
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/existing-app-id`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should handle deployment API errors', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'existing-app-id',
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/existing-app-id`,
      }).reply(200, {
        appHost: 'existing-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'existing-app-id',
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
        uri: `/user-applications/existing-app-id/deployments`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should handle app creation with retry when host is taken', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {input} = await import('@inquirer/prompts')
      vi.mocked(input).mockResolvedValue('Test App')

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
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
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      })
        .once()
        .reply(200, {
          appHost: 'generated-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: 'new-app-id',
          organizationId: 'org-id',
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
        uri: `/user-applications/new-app-id/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Success! Application deployed')
    })

    test('should handle app creation failure with non-retryable error', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {input} = await import('@inquirer/prompts')
      vi.mocked(input).mockResolvedValue('Test App')

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(500, {
        message: 'Internal server error',
        statusCode: 500,
      })

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should handle findUserApplicationForApp API errors', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'existing-app-id',
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
        },
        uri: `/user-applications/existing-app-id`,
      }).reply(500, {
        error: 'Internal server error',
      })

      const {error} = await testCommand(DeployCommand, ['--no-build'], {
        config: {root: cwd},
      })

      expect(error?.message).toContain('Error deploying application')
    })

    test('should test input validation for app title', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      const {input} = await import('@inquirer/prompts')
      vi.mocked(input).mockResolvedValue('Valid App Title')

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [])

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        method: 'post',
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'new-app-id',
        organizationId: 'org-id',
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
        uri: `/user-applications/new-app-id/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()

      expect(vi.mocked(input)).toHaveBeenCalledWith({
        message: 'Enter a title for your application:',
        validate: expect.any(Function),
      })
    })

    test('should allow selecting from list of apps', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [
        {
          appHost: 'existing-host-1',
          createdAt: '2024-01-01T00:00:00Z',
          id: 'existing-app-id-1',
          organizationId: 'org-id',
          projectId: null,
          title: 'Existing App 1',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
        {
          appHost: 'existing-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: 'existing-app-id-2',
          organizationId: 'org-id',
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
        uri: `/user-applications/existing-app-id-2/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      mockSelect.mockResolvedValue('existing-host-2')

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain(`Add id: 'existing-app-id-2'`)
      expect(stdout).toContain('to `app` in sanity.cli.js or sanity.cli.ts')
      expect(stdout).toContain('to avoid prompting on next deploy.')
    })

    test('should allow creating a new app by selecting from list of apps', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: 'org-id',
        },
      })

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appType: 'coreApp',
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, [
        {
          appHost: 'existing-host-1',
          createdAt: '2024-01-01T00:00:00Z',
          id: 'existing-app-id-1',
          organizationId: 'org-id',
          projectId: null,
          title: 'Existing App 1',
          type: 'coreApp',
          updatedAt: '2024-01-01T00:00:00Z',
          urlType: 'internal',
        },
        {
          appHost: 'existing-host-2',
          createdAt: '2024-01-01T00:00:00Z',
          id: 'existing-app-id-2',
          organizationId: 'org-id',
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
          organizationId: 'org-id',
        },
        uri: `/user-applications`,
      }).reply(200, {
        appHost: 'generated-host',
        createdAt: '2024-01-01T00:00:00Z',
        id: 'new-app-id',
        organizationId: 'org-id',
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
        uri: `/user-applications/new-app-id/deployments`,
      }).reply(200, {
        id: 'deployment-id',
      })

      mockSelect.mockResolvedValue('NEW_APP')

      const {error, stdout} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Success! Application deployed')
      expect(stdout).toContain(`Add id: 'new-app-id'`)
      expect(stdout).toContain('to `app` in sanity.cli.js or sanity.cli.ts')
      expect(stdout).toContain('to avoid prompting on next deploy.')
    })

    test('should throw an error if organizationId is not set', async () => {
      const cwd = join(examplesDir, 'basic-app')
      process.cwd = () => cwd

      mockGetCliConfig.mockResolvedValue({
        app: {
          organizationId: undefined,
        },
      })

      const {error} = await testCommand(DeployCommand, [], {
        config: {root: cwd},
      })

      expect(error?.message).toContain(
        'sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required for the Sanity CLI to communicate with the Sanity API',
      )
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
