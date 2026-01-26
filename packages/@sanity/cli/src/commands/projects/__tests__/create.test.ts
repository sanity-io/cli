import {runCommand} from '@oclif/test'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {CREATE_PROJECT_API_VERSION} from '../../../services/projects.js'
import CreateProjectCommand from '../create.js'

const mockConfirm = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mockConfirm,
    input: mockInput,
    select: mockSelect,
  }
})

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockImplementation(async (options) => {
      const testClient = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        config: vi.fn().mockReturnValue({apiHost: 'https://api.sanity.io'}),
        projects: {
          list: vi.fn().mockResolvedValue([]),
        },
        request: testClient.request,
        users: {
          getById: vi.fn().mockResolvedValue({
            email: 'test@example.com',
            id: 'user-123',
            name: 'Test User',
          }),
        } as never,
      }
    }),
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const testClient = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          create: mockCreateDataset,
          list: vi.fn().mockResolvedValue([]),
        },
        request: testClient.request,
      }
    }),
  }
})

const defaultMocks = {
  projectRoot: {
    directory: '/test/path',
    path: '/test/path',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#projects:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['projects create', '--help'])

    expect(stdout).toMatchInlineSnapshot(String.raw`
      "Create a new Sanity project

      USAGE
        $ sanity projects create [PROJECTNAME] [--dataset <value>]
          [--dataset-visibility private|public] [--json] [--organization <slug|id>]
          [-y]

      ARGUMENTS
        [PROJECTNAME]  Name of the project to create

      FLAGS
        -y, --yes                          Skip prompts and use defaults (project: "My
                                           Sanity Project", dataset: production,
                                           visibility: public)
            --dataset=<value>              Create a dataset. Prompts for visibility
                                           unless specified or --yes used
            --dataset-visibility=<option>  Dataset visibility: public or private
                                           <options: private|public>
            --json                         Output in JSON format
            --organization=<slug|id>       Organization to create the project in

      DESCRIPTION
        Create a new Sanity project

      EXAMPLES
        Interactively create a project

          $ sanity projects create

        Create a project named "My New Project"

          $ sanity projects create "My New Project"

        Create a project in a specific organization

          $ sanity projects create "My Project" --organization=my-org

        Create a project with a dataset (will prompt for details)

          $ sanity projects create "My Project" --dataset

        Create a project with a private dataset named "staging"

          $ sanity projects create "My Project" --dataset=staging \
            --dataset-visibility=private

        Create a project non-interactively with JSON output

          $ sanity projects create "CI Project" --yes --json

      "
    `)
  })

  test('throws error if provided invalid dataset flag', async () => {
    const {error} = await runCommand(['projects create', '--dataset=~~invalid-name'])

    expect(error?.message).toContain('Dataset name must start with a letter or a number')
  })

  test('errors when retrieving organization fails', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(CreateProjectCommand, ['My Project'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Failed to retrieve an organization')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when requested organization id is not found', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    const {error} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--organization=invalid'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(error?.message).toContain('Failed to retrieve organization invalid')
    expect(error?.message).toContain(
      `Organization "invalid" not found or you don't have access to it`,
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when create project fails', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(400, {message: 'Bad request'})

    const {error} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--organization=org-1'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(error?.message).toContain('Failed to create project')
    expect(error?.message).toContain('Bad request')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts user and creates organization when user has no organizations', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [])

    mockInput.mockResolvedValue('Test Organization')

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'post',
      uri: '/organizations',
    }).reply(201, {
      id: 'new-org-id',
      name: 'Test Organization',
      slug: 'test-organization',
    })

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(CreateProjectCommand, ['My Project'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error).toBeUndefined()
    expect(mockInput).toHaveBeenCalledWith({
      default: 'Test User',
      message: 'Organization name:',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('Organization: Test Organization')
  })

  test('prompts user and creates organization when user selects new organization', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Existing Org', slug: 'existing-org'}])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations/org-1/grants',
    }).reply(200, [
      {
        grants: [{grantId: 'attach', permission: true}],
        memberId: 'user-123',
      },
    ])

    mockSelect.mockResolvedValue('-new-')
    mockInput.mockResolvedValue('New Organization')

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'post',
      uri: '/organizations',
    }).reply(201, {
      id: 'new-org-id',
      name: 'New Organization',
      slug: 'new-organization',
    })

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(CreateProjectCommand, ['My Project'], {
      mocks: {...defaultMocks, isInteractive: true},
    })

    expect(error).toBeUndefined()
    expect(mockSelect).toHaveBeenCalledWith({
      choices: expect.arrayContaining([expect.objectContaining({value: '-new-'})]),
      default: undefined,
      message: 'Select organization:',
    })
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('Organization: New Organization')
  })

  test('creates project with dataset in unattended mode', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Sanity Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, ['privateDataset'])

    mockCreateDataset.mockResolvedValueOnce({
      aclMode: 'private',
      datasetName: 'staging',
    })

    const {error, stdout} = await testCommand(
      CreateProjectCommand,
      ['--yes', '--dataset=staging', '--dataset-visibility=private', '--organization=org-1'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('My Sanity Project')
    expect(stdout).toContain('Dataset: staging (private)')
  })

  test('creates project without dataset in unattended mode', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Sanity Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(
      CreateProjectCommand,
      ['--yes', '--organization=org-1'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('My Sanity Project')
    expect(stdout).not.toContain('Dataset:')
  })

  test('creates project with `production` dataset when user chooses default config', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations/org-1/grants',
    }).reply(200, [
      {
        grants: [{grantId: 'attach', permission: true}],
        memberId: 'user-123',
      },
    ])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    mockSelect.mockResolvedValueOnce('org-1') // Select organization
    mockConfirm.mockResolvedValueOnce(true) // Would you like to create a dataset?
    mockConfirm.mockResolvedValueOnce(true) // Use default config?

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, [])

    mockCreateDataset.mockResolvedValueOnce({
      aclMode: 'public',
      datasetName: 'production',
    })

    const {error, stdout} = await testCommand(CreateProjectCommand, ['My Project'], {
      mocks: {...defaultMocks, isInteractive: true},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('Dataset: production (public)')
  })

  test('creates project with named dataset when user chooses custom name', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    mockConfirm.mockResolvedValueOnce(true) // Would you like to create a dataset?
    mockConfirm.mockResolvedValueOnce(false) // Use default config?

    mockInput.mockResolvedValue('staging')

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, [])

    mockCreateDataset.mockResolvedValueOnce({
      aclMode: 'public',
      datasetName: 'staging',
    })

    const {error, stdout} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--organization=org-1'],
      {
        mocks: {...defaultMocks, isInteractive: true},
      },
    )

    expect(error).toBeUndefined()
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('Project created successfully')
    expect(stdout).toContain('Dataset: staging (public)')
  })

  test('warns user when dataset creation fails', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    mockApi({
      apiVersion: PROJECT_FEATURES_API_VERSION,
      method: 'get',
      uri: '/features',
    }).reply(200, [])

    mockCreateDataset.mockRejectedValueOnce(new Error('Failed to create Dataset'))

    const {error, stderr, stdout} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--dataset=production', '--organization=org-1'],
      {
        mocks: {...defaultMocks, isInteractive: true},
      },
    )

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project created successfully')
    expect(stderr).toContain('Project created but dataset creation failed')
  })

  test('creates project with JSON output', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--organization=org-1', '--json'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error).toBeUndefined()
    const json = JSON.parse(stdout)
    expect(json).toEqual({
      displayName: 'My Project',
      projectId: 'proj-123',
    })
  })

  test('prompts for project name when not provided', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockInput.mockResolvedValue('My Custom Project')

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Custom Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(CreateProjectCommand, ['--organization=org-1'], {
      mocks: {...defaultMocks, isInteractive: true},
    })

    expect(error).toBeUndefined()
    expect(mockInput).toHaveBeenCalledWith({
      default: 'My Sanity Project',
      message: 'Project name:',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('My Custom Project')
  })

  test('includes manage URL in output', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(201, {
      displayName: 'My Project',
      id: 'proj-123',
      projectId: 'proj-123',
    })

    const {error, stdout} = await testCommand(
      CreateProjectCommand,
      ['My Project', '--organization=org-1'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error).toBeUndefined()
    expect(stdout).toContain('Manage your project: https://www.sanity.io/manage/project/proj-123')
  })
})
