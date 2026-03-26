import {exitCodes, studioWorkerTask} from '@sanity/cli-core'
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
const mockSelect = vi.mocked(select)
const mockInput = vi.mocked(input)
const mockCheckDir = vi.mocked(checkDir)
const mockGetLocalPackageVersion = vi.mocked(getLocalPackageVersion)
const mockBuildStudio = vi.mocked(buildStudio)

describe('#deploy studio (external)', () => {
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

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('URL must use http or https protocol')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  describe('--url flag', () => {
    test('should use --url flag as external studio URL', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const externalUrl = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appHost: externalUrl,
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: externalUrl,
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
      }).reply(201, {id: deploymentId, location: externalUrl}, {location: externalUrl})

      const {error, stdout} = await testCommand(
        DeployCommand,
        ['--external', '--url', externalUrl],
        {
          config: {root: cwd},
          mocks: {
            cliConfig: {
              api: {projectId},
            },
          },
        },
      )

      if (error) throw error
      expect(stdout).toContain('Success! Studio registered')
      expect(mockInput).not.toHaveBeenCalled()
      expect(mockSelect).not.toHaveBeenCalled()
    })

    test('should use --url flag with --yes for unattended external deploy', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const externalUrl = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appHost: externalUrl,
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: externalUrl,
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
      }).reply(201, {id: deploymentId, location: externalUrl}, {location: externalUrl})

      const {error, stdout} = await testCommand(
        DeployCommand,
        ['--external', '--yes', '--url', externalUrl],
        {
          config: {root: cwd},
          mocks: {
            cliConfig: {
              api: {projectId},
            },
          },
        },
      )

      if (error) throw error
      expect(stdout).toContain('Success! Studio registered')
      expect(mockInput).not.toHaveBeenCalled()
      expect(mockSelect).not.toHaveBeenCalled()
    })

    test('should --url flag take precedence over studioHost config', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const flagUrl = 'https://new-studio.example.com'
      const studioAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

      // The --url value should be used for lookup, not the studioHost config
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {
          appHost: flagUrl,
          appType: 'studio',
        },
        uri: `/projects/${projectId}/user-applications`,
      }).reply(200, {
        appHost: flagUrl,
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
      }).reply(201, {id: deploymentId, location: flagUrl}, {location: flagUrl})

      const {error, stdout} = await testCommand(DeployCommand, ['--external', '--url', flagUrl], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
            studioHost: 'https://old-studio.example.com',
          },
        },
      })

      if (error) throw error
      expect(stdout).toContain('Success! Studio registered')
    })

    test('should reject invalid --url for external deploy', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'

      const {error} = await testCommand(
        DeployCommand,
        ['--external', '--url', 'ftp://invalid.com'],
        {
          config: {root: cwd},
          mocks: {
            cliConfig: {
              api: {projectId},
            },
          },
        },
      )

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('URL must use http or https protocol')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    })

    test('should normalize --url with trailing slash for external deploy', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'
      const normalizedUrl = 'https://studio.example.com'
      const studioAppId = 'external-app-id'
      const deploymentId = 'deployment-id'

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
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications/${studioAppId}/deployments`,
      }).reply(201, {id: deploymentId, location: normalizedUrl}, {location: normalizedUrl})

      const {error, stdout} = await testCommand(
        DeployCommand,
        ['--external', '--url', 'https://studio.example.com/'],
        {
          config: {root: cwd},
          mocks: {
            cliConfig: {
              api: {projectId},
            },
          },
        },
      )

      if (error) throw error
      expect(stdout).toContain('Success! Studio registered')
    })
  })

  describe('unattended mode', () => {
    test('should error when --external --yes used without --url and no studioHost', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'

      // No apps exist for this project
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications`,
      })
        .once()
        .reply(200, [])

      const {error} = await testCommand(DeployCommand, ['--external', '--yes'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
          },
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Cannot prompt for external studio URL in unattended mode')
      expect(error?.message).toContain('Use --url to specify the external studio URL')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    })

    test('should error when --external --yes with multiple studios and no appId', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project-id'

      // Return multiple external apps
      mockApi({
        apiVersion: USER_APPLICATIONS_API_VERSION,
        query: {appType: 'studio'},
        uri: `/projects/${projectId}/user-applications`,
      })
        .once()
        .reply(200, [
          {
            appHost: 'https://studio-one.example.com',
            createdAt: '2024-01-01T00:00:00Z',
            id: 'app-1',
            projectId,
            title: 'Studio One',
            type: 'studio',
            updatedAt: '2024-01-01T00:00:00Z',
            urlType: 'external',
          },
          {
            appHost: 'https://studio-two.example.com',
            createdAt: '2024-01-01T00:00:00Z',
            id: 'app-2',
            projectId,
            title: 'Studio Two',
            type: 'studio',
            updatedAt: '2024-01-01T00:00:00Z',
            urlType: 'external',
          },
        ])

      const {error} = await testCommand(DeployCommand, ['--external', '--yes'], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            api: {projectId},
          },
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Cannot prompt for external studio URL in unattended mode')
      expect(error?.message).toContain('Use --url to specify the external studio URL')
      expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
      expect(mockSelect).not.toHaveBeenCalled()
    })
  })

  describe('schema and manifest deployment', () => {
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
  })
})
