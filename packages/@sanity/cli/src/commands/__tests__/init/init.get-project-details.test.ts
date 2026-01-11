import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations'
import {CREATE_PROJECT_API_VERSION} from '../../../services/projects'
import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  createDataset: vi.fn(),
  createProject: vi.fn(),
  input: vi.fn(),
  listDatasets: vi.fn(),
  listProjects: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: vi.fn().mockResolvedValue(null),
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const globalTestClient = createTestClient({
    apiVersion: 'v2025-05-14',
    token: 'test-token',
  })

  const projectTestClient = createTestClient({
    apiVersion: 'v2025-09-16',
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
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        create: mocks.createDataset,
        list: mocks.listDatasets,
      } as never,
      request: projectTestClient.request,
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

    mocks.select.mockResolvedValueOnce('org-123')

    const {error} = await testCommand(InitCommand, ['--template=app-quickstart'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select organization:',
      }),
    )

    expect(error).toBeUndefined()
  })

  test('returns `Unknown project` if project/organization call fails and in unattended mode with project id provided', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    // Use --yes for unattended mode, --project to provide project id, --dataset and --bare to exit gracefully
    const {error} = await testCommand(InitCommand, [
      '--yes',
      '--project=test-project-123',
      '--dataset=production',
      '--output-path=/tmp/test',
    ])

    // The command will eventually error out during setup, but that's after getProjectDetails
    // The fact it doesn't throw during getProjectDetails means "Unknown project" was returned
    expect(error).toBeUndefined()
  })

  test('throws error if project/organization call fails and not in unattended mode', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(InitCommand, [], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Should throw error about failing to communicate with API
    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to communicate with the Sanity API')
  })

  test('throws error if no projects are returned and in unattended mode', async () => {
    // Mock API calls to return empty arrays
    mocks.listProjects.mockResolvedValueOnce([])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Provide --project flag but projects list is empty
    const {error} = await testCommand(InitCommand, [
      '--yes',
      '--project=some-project',
      '--dataset=production',
      '--output-path=/tmp/test',
    ])

    expect(error?.message).toContain('No projects found for current user')
  })

  test('throws error if project flag is passed and is not present in retrieved project list', async () => {
    // Mock listProjects to return projects that don't include the requested one
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing Project',
        id: 'project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Not in unattended mode (no --yes flag), providing a project that doesn't exist
    const {error} = await testCommand(InitCommand, ['--project=non-existent-project'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toBe(
      'Given project ID (non-existent-project) not found, or you do not have access to it',
    )
  })

  test('throws error if organization flag is passed and is not present in retrieved organization list', async () => {
    // Mock listProjects to return some projects
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Existing Project',
        id: 'project-123',
      },
    ])

    // Mock listOrganizations to return organizations that don't include the requested one
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

    // Providing an organization that doesn't exist
    const {error} = await testCommand(InitCommand, ['--organization=non-existent-org'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toBe(
      'Given organization ID (non-existent-org) not found, or you do not have access to it',
    )
  })

  test('prompts user for project name when it is their first project', async () => {
    // Mock listProjects to return empty array (first project)
    mocks.listProjects.mockResolvedValueOnce([])

    // Mock listOrganizations
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

    // Mock input for project name
    mocks.input.mockResolvedValueOnce('My First Project')

    // Mock select for organization
    mocks.select.mockResolvedValueOnce('org-123')

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'new-project-123',
    })

    // Mock listDatasets for the newly created project
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

    // Provide --dataset flag to skip dataset prompt
    const {stdout} = await testCommand(InitCommand, ['--bare', '--dataset=production'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Verify input prompt was called for project name
    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Project name:',
      }),
    )

    // Verify the project and dataset are in the output
    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: new-project-123')
    expect(stdout).toContain('Dataset: production')
  })

  test('prompts user to select existing project', async () => {
    // Mock listProjects to return existing projects
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

    // Mock listOrganizations
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

    // Mock select for project selection - user selects existing project
    mocks.select.mockResolvedValueOnce('project-1')

    // Mock listDatasets for the selected project
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
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Verify select prompt was called with project choices
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
    // Mock listProjects to return existing projects
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

    // Mock select for project selection - user selects 'new'
    mocks.select.mockResolvedValueOnce('new')

    // Mock input for new project name
    mocks.input.mockResolvedValueOnce('New Project')

    // Mock select for organization
    mocks.select.mockResolvedValueOnce('org-123')

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'new-project-456',
    })

    // Mock listDatasets for the newly created project
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
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Verify select was called for project creation
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Create a new project or select an existing one',
      }),
    )

    // Verify input was called for project name
    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Project name:',
      }),
    )

    // Verify select was called for organization
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
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    const {error} = await testCommand(InitCommand, [
      '--yes',
      '--project=test-project-123',
      '--dataset=production',
      '--output-path=/tmp/test',
    ])

    expect(error).toBeUndefined()
  })

  test('throws warn if visibility flag is provided but not available as a project feature', async () => {
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Mock empty dataset
    mocks.listDatasets.mockResolvedValueOnce([])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDatase'])

    const {error, stderr} = await testCommand(
      InitCommand,
      ['--project=test-project-123', '--dataset=production', '--visibility=private'],
      {
        mocks: {
          isInteractive: true,
          token: 'test-token',
        },
      },
    )

    expect(error?.message).toBeUndefined()
    expect(stderr).toContain('Warning: Private datasets are not available for this project.')
  })

  test('prompts user to create dataset if dataset from flag does not exits', async () => {
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValueOnce([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Mock listDatasets - dataset doesn't exist
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
          isInteractive: true,
          token: 'test-token',
        },
      },
    )

    expect(stdout).toContain('Below are your project details')
    expect(stdout).toContain('Project ID: test-project-123')
    expect(stdout).toContain('Dataset: staging')
  })

  test('prompts user to create dataset if none exist', async () => {
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Mock listDatasets - no datasets exist
    mocks.listDatasets.mockResolvedValueOnce([])

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    // Mock confirm for default config prompt - user chooses not to use default
    mocks.confirm.mockResolvedValueOnce(false)

    // Mock input for dataset name - should return 'production'
    mocks.input.mockResolvedValueOnce('production')

    // Mock select for ACL mode - should return 'private'
    mocks.select.mockResolvedValueOnce('private')

    // Mock createDataset
    mocks.createDataset.mockResolvedValueOnce(undefined)

    const {stdout} = await testCommand(InitCommand, ['--project=test-project-123', '--bare'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Vefity default config prompt
    expect(mocks.confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Use the default dataset configuration?',
    })

    // Verify input prompt was called for dataset name
    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Name of your first dataset:',
      }),
    )

    // Verify select was called for ACL mode
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
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Mock listDatasets - existing datasets
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

    // Mock select - user selects existing dataset
    mocks.select.mockResolvedValueOnce('production')

    const {stdout} = await testCommand(InitCommand, ['--project=test-project-123', '--bare'], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    // Verify select was called for dataset selection
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
    // Mock listProjects to return existing project
    mocks.listProjects.mockResolvedValue([
      {
        createdAt: '2024-01-01T00:00:00Z',
        displayName: 'Test Project',
        id: 'test-project-123',
      },
    ])

    // Mock listOrganizations
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    // Mock listDatasets - existing datasets
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

    // Mock select - user selects 'new'
    mocks.select.mockResolvedValueOnce('new')

    // Mock input for dataset name
    mocks.input.mockResolvedValueOnce('staging')

    // Mock createDataset
    mocks.createDataset.mockResolvedValueOnce(undefined)

    const {stdout} = await testCommand(
      InitCommand,
      ['--project=test-project-123', '--bare', '--visibility=public'],
      {
        mocks: {
          isInteractive: true,
          token: 'test-token',
        },
      },
    )

    // Verify select was called for dataset selection
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select dataset to use',
      }),
    )

    // Verify input was called for dataset name
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
