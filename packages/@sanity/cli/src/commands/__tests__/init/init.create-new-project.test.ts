import * as cliUX from '@sanity/cli-core/ux'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECT_FEATURES_API_VERSION} from '../../../services/getProjectFeatures.js'
import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {CREATE_PROJECT_API_VERSION, PROJECTS_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init.js'

const mocks = vi.hoisted(() => ({
  datasetsCreate: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getOrganizationChoices: vi.fn(),
  getOrganizationsWithAttachGrantInfo: vi.fn(),
  input: vi.fn(),
  listDatasets: vi.fn(),
  select: vi.fn(),
  usersGetById: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')

  return {
    ...actual,
    input: mocks.input,
    select: mocks.select,
  }
})

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
        list: vi.fn().mockResolvedValue([
          {createdAt: '2024-01-01T00:00:00Z', displayName: 'Test', id: 'test'},
          {createdAt: '2024-01-01T00:00:00Z', displayName: 'Project-123', id: 'project-123'},
        ]),
      },
      request: globalTestClient.request,
      users: {
        getById: mocks.usersGetById,
      } as never,
    }),
    getProjectCliClient: vi.fn().mockImplementation(async (options) => {
      const client = createTestClient({
        apiVersion: options.apiVersion,
        token: 'test-token',
      })

      return {
        datasets: {
          create: mocks.datasetsCreate,
          list: mocks.listDatasets,
        } as never,
        request: client.request,
      }
    }),
  }
})

vi.mock('../../../actions/organizations/getOrganizationChoices.js', () => ({
  getOrganizationChoices: mocks.getOrganizationChoices,
}))

vi.mock('../../../actions/organizations/getOrganizationsWithAttachGrantInfo.js', () => ({
  getOrganizationsWithAttachGrantInfo: mocks.getOrganizationsWithAttachGrantInfo,
}))

mocks.usersGetById.mockResolvedValue({
  email: 'test@example.com',
  id: 'user-123',
  name: 'Test User',
  provider: 'saml-123',
})

// Below mocks are to make sure rest of command resolves successfully after new project logic
vi.mock('../../../util/getProjectDefaults.js', () => ({
  getProjectDefaults: vi.fn().mockResolvedValue({
    author: undefined,
    description: '',
    gitRemote: '',
    license: 'UNLICENSED',
    projectName: 'test-project',
  }),
}))

vi.mock('../../../actions/mcp/mcp.js', () => ({
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

const setupInitSuccessMocks = () => {
  mockApi({
    apiVersion: ORGANIZATIONS_API_VERSION,
    method: 'get',
    uri: '/organizations',
  }).reply(200, [{id: 'org-1', name: 'Org 1', slug: 'org-1'}])

  mockApi({
    apiVersion: PROJECT_FEATURES_API_VERSION,
    method: 'get',
    uri: '/features',
  }).reply(200, ['privateDataset'])

  mocks.listDatasets.mockResolvedValue([
    {aclMode: 'public', name: 'test'},
    {aclMode: 'public', name: 'production'},
  ])

  mockApi({
    apiVersion: PROJECTS_API_VERSION,
    method: 'get',
    uri: '/projects/project-123',
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

describe('#init: create new project', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('prompts user to create new organization if they have none', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)
    mocks.listDatasets.mockResolvedValue([{aclMode: 'public', name: 'test'}])

    // Mocks for new org, project and datset creation
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [])

    mocks.input.mockResolvedValueOnce('My New Organization')

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'post',
      uri: '/organizations',
    }).reply(200, {
      createdByUserId: 'user-123',
      defaultRoleName: null,
      features: [],
      id: 'org-123',
      members: [],
      name: 'My New Organization',
      slug: 'my-new-organization',
    })

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'project-123',
    })

    mocks.datasetsCreate.mockResolvedValueOnce(undefined)

    // Mocks needed for rest of command so it resolves without error
    setupInitSuccessMocks()

    const spinnerSpy = vi.spyOn(cliUX, 'spinner')

    await testCommand(
      InitCommand,
      [
        '--create-project=Test Project',
        '--dataset=production',
        '--output-path=./test-project',
        '--no-nextjs-add-config-files',
        '--no-nextjs-append-env',
        '--no-nextjs-embed-studio',
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

    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        default: 'Test User',
        message: 'Organization name:',
      }),
    )

    expect(mocks.datasetsCreate).toHaveBeenCalledWith('production')

    expect(spinnerSpy).toHaveBeenCalledWith('Creating organization')
    expect(spinnerSpy).toHaveBeenCalledWith('Creating dataset')
  })

  test('prompts user to select then create a new organization', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    // Mocks for organization selection/creation and new project/dataset creation
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'get',
      uri: '/organizations',
    }).reply(200, [
      {
        id: 'existing-org-123',
        name: 'Existing Organization',
        slug: 'existing-organization',
      },
    ])

    mocks.getOrganizationsWithAttachGrantInfo.mockResolvedValueOnce([
      {
        hasAttachGrant: true,
        organization: {
          id: 'existing-org-123',
          name: 'Existing Organization',
          slug: 'existing-organization',
        },
      },
    ])

    mocks.getOrganizationChoices.mockReturnValueOnce([
      {name: 'Existing Organization [existing-org-123]', value: 'existing-org-123'},
      {name: 'Create new organization', value: '-new-'},
    ])

    mocks.select.mockResolvedValueOnce('-new-')

    mocks.input.mockResolvedValueOnce('Brand New Organization')

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      method: 'post',
      uri: '/organizations',
    }).reply(200, {
      createdByUserId: 'user-123',
      defaultRoleName: null,
      features: [],
      id: 'new-org-456',
      members: [],
      name: 'Brand New Organization',
      slug: 'brand-new-organization',
    })

    mockApi({
      apiVersion: CREATE_PROJECT_API_VERSION,
      method: 'post',
      uri: '/projects',
    }).reply(200, {
      displayName: 'Test Project',
      projectId: 'project-123',
    })

    mocks.datasetsCreate.mockResolvedValueOnce(undefined)

    setupInitSuccessMocks()

    const spinnerSpy = vi.spyOn(cliUX, 'spinner')

    await testCommand(
      InitCommand,
      [
        '--create-project=Test Project',
        '--dataset=production',
        '--output-path=./test-project',
        '--no-nextjs-add-config-files',
        '--no-nextjs-append-env',
        '--no-nextjs-embed-studio',
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

    expect(mocks.datasetsCreate).toHaveBeenCalledWith('production')

    expect(spinnerSpy).toHaveBeenCalledWith('Creating organization')
    expect(spinnerSpy).toHaveBeenCalledWith('Creating dataset')
  })
})
