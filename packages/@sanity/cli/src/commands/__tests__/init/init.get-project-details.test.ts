import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {CREATE_PROJECT_API_VERSION, PROJECTS_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init.js'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  createDataset: vi.fn(),
  createProject: vi.fn(),
  input: vi.fn(),
  listDatasets: vi.fn(),
  listProjects: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue(null),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const globalTestClient = createTestClient({
    apiVersion: 'v2025-05-14',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      projects: {
        list: mocks.listProjects,
      },
      request: globalTestClient.request,
      users: {
        getById: vi.fn().mockResolvedValue({
          email: 'test@example.com',
          id: 'user-123',
          name: 'Test User',
          provider: 'saml-123',
        }),
      } as never,
    }),
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const client = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          create: mocks.createDataset,
          list: mocks.listDatasets,
        } as never,
        request: client.request,
      }
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')

  return {
    ...actual,
    confirm: mocks.confirm,
    input: mocks.input,
    select: mocks.select,
  }
})

// Below mocks are to make sure rest of command resolves successfully after getting project details
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({
    author: undefined,
    description: '',
    gitRemote: undefined,
    license: 'UNLICENSED',
    projectName: 'test-project',
  }),
}))

vi.mock('../../../actions/mcp/setupMCP.js', () => ({
  setupMCP: vi.fn().mockResolvedValue({
    configuredEditors: [],
    detectedEditors: [],
    error: undefined,
    skipped: false,
  }),
}))

vi.mock('../../../actions/init/checkNextJsReactCompatibility.js', () => ({
  checkNextJsReactCompatibility: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/bootstrapTemplate.js', () => ({
  bootstrapTemplate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../actions/init/resolvePackageManager.js', () => ({
  resolvePackageManager: vi.fn().mockResolvedValue('npm'),
}))

vi.mock('../../../util/packageManager/installPackages.js', () => ({
  installDeclaredPackages: vi.fn().mockResolvedValue(undefined),
}))

const setupInitSuccessMocks = (projectId: string) => {
  mockApi({
    apiVersion: PROJECTS_API_VERSION,
    method: 'get',
    uri: `/projects/${projectId}`,
  }).reply(200, {
    id: 'test',
    metadata: {cliInitializedAt: ''},
  })
}

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#init: get project details', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('prompts user for organization if provided template is app template', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      query: {includeImplicitMemberships: 'true', includeMembers: 'true'},
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'org-123',
        name: 'Test Organization',
        slug: 'test-organization',
      },
    ])

    mocks.select.mockResolvedValueOnce('org-123')

    setupInitSuccessMocks('')

    const {error} = await testCommand(
      InitCommand,
      [
        '--template=app-quickstart',
        '--output-path=./test-project',
        '--no-typescript',
        '--no-overwrite-files',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select organization:',
      }),
    )

    if (error) throw error
  })

  test('returns `Unknown project` if project/organization call fails and in unattended mode with project id provided', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    setupInitSuccessMocks('test-project-123')

    const {error} = await testCommand(
      InitCommand,
      [
        '--yes',
        '--project=test-project-123',
        '--dataset=production',
        '--output-path=/tmp/test',
        '--no-typescript',
        '--no-overwrite-files',
      ],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    // The command will eventually error out during setup, but that's after getProjectDetails
    // The fact it doesn't throw during getProjectDetails means "Unknown project" was returned
    if (error) throw error
  })

  test('throws error if project/organization call fails and not in unattended mode', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(InitCommand, [], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to communicate with the Sanity API')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error if no projects are returned and in unattended mode', async () => {
    mocks.listProjects.mockResolvedValueOnce([])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--project=some-project', '--dataset=production', '--output-path=/tmp/test'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(error?.message).toContain('No projects found for current user')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error if project flag is passed and is not present in retrieved project list', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing Project',
        id: 'project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    const {error} = await testCommand(InitCommand, ['--project=non-existent-project'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toBe(
      'Given project ID (non-existent-project) not found, or you do not have access to it',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error if organization flag is passed and is not present in retrieved organization list', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing Project',
        id: 'project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'org-123',
        name: 'Existing Organization',
        slug: 'existing-organization',
      },
    ])

    const {error} = await testCommand(InitCommand, ['--organization=non-existent-org'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toBe(
      'Given organization ID (non-existent-org) not found, or you do not have access to it',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts user for project name when it is their first project', async () => {
    mocks.listProjects.mockResolvedValueOnce([])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'org-123',
        name: 'Test Organization',
        slug: 'test-organization',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations/org-123/grants',
    }).reply(200, {
      'sanity.organization.projects': [
        {
          grants: [{name: 'attach'}],
        },
      ],
    })

    mocks.input.mockResolvedValueOnce('My First Project')
    mocks.select.mockResolvedValueOnce('org-123')

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'new-project-123',
    })

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    const {stdout} = await testCommand(InitCommand, ['--bare', '--dataset=production'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Project name:',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: new-project-123')
    expect(stdout).toContain('Dataset: production')
  })

  test('prompts user to select existing project', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Project One',
        id: 'project-1',
      },
      {
        createdAt: '2024-01-02T00:00:00Z',
        displayName: 'Project Two',
        id: 'project-2',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'org-123',
        name: 'Test Organization',
        slug: 'test-organization',
      },
    ])

    mocks.select.mockResolvedValueOnce('project-1')

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    const {stdout} = await testCommand(InitCommand, ['--bare', '--dataset=production'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Create a new project or select an existing one',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: project-1')
    expect(stdout).toContain('Dataset: production')
  })

  test('prompts user to create project and select organization if they select to create a new project', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing Project',
        id: 'project-1',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'org-123',
        name: 'Test Organization',
        slug: 'test-organization',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations/org-123/grants',
    }).reply(200, {
      'sanity.organization.projects': [
        {
          grants: [{name: 'attach'}],
        },
      ],
    })

    mocks.select.mockResolvedValueOnce('new')
    mocks.input.mockResolvedValueOnce('New Project')
    mocks.select.mockResolvedValueOnce('org-123')

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'new-project-456',
    })

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    const {stdout} = await testCommand(InitCommand, ['--bare', '--dataset=production'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Create a new project or select an existing one',
      }),
    )

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Project name:',
      }),
    )

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select organization:',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: new-project-456')
    expect(stdout).toContain('Dataset: production')
  })

  test('returns dataset if dataset flag is provided and in unattended mode', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    setupInitSuccessMocks('test-project-123')

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--project=test-project-123', '--dataset=production', '--output-path=/tmp/test'],
      {
        mocks: {...defaultMocks},
      },
    )

    if (error) throw error
  })

  test('throws warn if visibility flag is provided but not available as a project feature', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    mocks.listDatasets.mockResolvedValueOnce([])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    setupInitSuccessMocks('test-project-123')

    const {error, stderr} = await testCommand(
      InitCommand,
      [
        '--project=test-project-123',
        '--dataset=production',
        '--visibility=private',
        '--output-path=/tmp/test',
        '--no-typescript',
        '--no-overwrite-files',
        '--template=clean',
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(error?.message).toBeUndefined()
    expect(stderr).toContain('Warning: Private datasets are not available for this project.')
  })

  test('prompts user to create dataset if dataset from flag does not exits', async () => {
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    const {stdout} = await testCommand(
      InitCommand,
      ['--project=test-project-123', '--dataset=staging', '--bare'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: test-project-123')
    expect(stdout).toContain('Dataset: staging')
  })

  test('prompts user to create dataset if none exist', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    mocks.listDatasets.mockResolvedValueOnce([])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    mocks.confirm.mockResolvedValueOnce(false)
    mocks.input.mockResolvedValueOnce('production')
    mocks.select.mockResolvedValueOnce('private')
    mocks.createDataset.mockResolvedValueOnce(undefined)

    const {stdout} = await testCommand(InitCommand, ['--project=test-project-123', '--bare'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Use the default dataset configuration?',
    })

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Name of your first dataset:',
      }),
    )

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dataset visibility',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: test-project-123')
    expect(stdout).toContain('Dataset: production')
  })

  test('prompts user to select existing dataset', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
      {
        aclMode: 'public',
        name: 'staging',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    mocks.select.mockResolvedValueOnce('production')

    const {stdout} = await testCommand(InitCommand, ['--project=test-project-123', '--bare'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select dataset to use',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: test-project-123')
    expect(stdout).toContain('Dataset: production')
  })

  test('prompts user to create dataset if they select to create a new dataset', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    mocks.listDatasets.mockResolvedValueOnce([
      {
        aclMode: 'public',
        name: 'production',
      },
    ])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    mocks.select.mockResolvedValueOnce('new')
    mocks.input.mockResolvedValueOnce('staging')
    mocks.createDataset.mockResolvedValueOnce(undefined)

    const {stdout} = await testCommand(
      InitCommand,
      ['--project=test-project-123', '--bare', '--visibility=public'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select dataset to use',
      }),
    )

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dataset name:',
      }),
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: test-project-123')
    expect(stdout).toContain('Dataset: staging')
  })
})
