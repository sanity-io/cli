import * as cliUX from '@sanity/cli-core/ux'
import {createTestClient, mockApi, mockClient, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {CREATE_PROJECT_API_VERSION} from '../../../services/projects.js'
import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  datasetsCreate: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getOrganizationChoices: vi.fn(),
  getOrganizationsWithAttachGrantInfo: vi.fn(),
  input: vi.fn(),
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
  const testClient = createTestClient({
    apiVersion: 'v2025-05-14',
    token: 'test-token',
  })

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue(
      mockClient({
        datasets: {
          create: mocks.datasetsCreate,
        } as never,
        request: testClient.request,
        users: {
          getById: mocks.usersGetById,
        } as never,
      }),
    ),
    getProjectCliClient: vi.fn().mockResolvedValue(
      mockClient({
        datasets: {
          create: mocks.datasetsCreate,
        } as never,
      }),
    ),
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

describe('#init: create new project', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('prompts user to create new organization if they have none', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

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

    const spinnerSpy = vi.spyOn(cliUX, 'spinner')

    await testCommand(
      InitCommand,
      ['--create-project=Test Project', '--dataset=production', '--output-path=./test-project'],
      {
        mocks: {
          isInteractive: true,
          token: 'test-token',
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

    const spinnerSpy = vi.spyOn(cliUX, 'spinner')

    await testCommand(
      InitCommand,
      ['--create-project=Test Project', '--dataset=production', '--output-path=./test-project'],
      {
        mocks: {
          isInteractive: true,
          token: 'test-token',
        },
      },
    )

    expect(mocks.datasetsCreate).toHaveBeenCalledWith('production')

    expect(spinnerSpy).toHaveBeenCalledWith('Creating organization')
    expect(spinnerSpy).toHaveBeenCalledWith('Creating dataset')
  })
})
