import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  createDataset: vi.fn(),
  createOrganization: vi.fn(),
  createProject: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getOrganizationChoices: vi.fn(),
  getOrganizationsWithAttachGrantInfo: vi.fn(),
  input: vi.fn(),
  listOrganizations: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  input: mocks.input,
  select: mocks.select,
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    spinner: mocks.spinner,
  }
})

vi.mock('../../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../services/user.js', () => ({
  getCliUser: vi.fn().mockResolvedValue({
    email: 'test@example.com',
    id: 'user-123',
    name: 'Test User',
    provider: 'saml-123',
  }),
}))

vi.mock('../../../actions/organizations/getOrganizationChoices.js', () => ({
  getOrganizationChoices: mocks.getOrganizationChoices,
}))

vi.mock('../../../actions/organizations/getOrganizationsWithAttachGrantInfo.js', () => ({
  getOrganizationsWithAttachGrantInfo: mocks.getOrganizationsWithAttachGrantInfo,
}))

vi.mock('../../../services/datasets.js', () => ({
  createDataset: mocks.createDataset,
}))

vi.mock('../../../services/organizations.js', () => ({
  createOrganization: mocks.createOrganization,
  listOrganizations: mocks.listOrganizations,
}))

vi.mock('../../../services/projects.js', () => ({
  createProject: mocks.createProject,
}))

describe('#init: create new project', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prompts user to create new organization if they have none', async () => {
    // Mock no framework detection
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    // Mock listOrganizations to return empty array (user has no organizations)
    mocks.listOrganizations.mockResolvedValueOnce([])

    // Mock input prompt for organization name
    mocks.input.mockResolvedValueOnce('My New Organization')

    // Mock createOrganization to return the created organization
    mocks.createOrganization.mockResolvedValueOnce({
      createdByUserId: 'user-123',
      defaultRoleName: null,
      features: [],
      id: 'org-123',
      members: [],
      name: 'My New Organization',
      slug: 'my-new-organization',
    })

    // Mock createProject to return the created project with correct structure
    mocks.createProject.mockResolvedValueOnce({
      displayName: 'Test Project',
      projectId: 'project-123',
    })

    // Mock createDataset
    mocks.createDataset.mockResolvedValueOnce(undefined)

    // Mock spinner instance
    const mockSpinnerInstance = {
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }
    mocks.spinner.mockReturnValue(mockSpinnerInstance)

    await testCommand(InitCommand, [
      '--create-project=Test Project',
      '--dataset=production',
      '--output-path=./test-project',
    ])

    // Verify listOrganizations was called
    expect(mocks.listOrganizations).toHaveBeenCalled()

    // Verify input prompt was called with correct parameters
    expect(mocks.input).toHaveBeenCalledWith(
      expect.objectContaining({
        default: 'Test User',
        message: 'Organization name:',
      }),
    )

    // Verify createOrganization was called with the input value
    expect(mocks.createOrganization).toHaveBeenCalledWith('My New Organization')

    // Verify createProject was called
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Test Project',
        organizationId: 'org-123',
      }),
    )

    // Verify createDataset was called
    expect(mocks.createDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        aclMode: undefined,
        datasetName: 'production',
        projectId: 'project-123',
      }),
    )

    // Verify spinner was called with correct text
    expect(mocks.spinner).toHaveBeenCalledWith('Creating organization')
    expect(mocks.spinner).toHaveBeenCalledWith('Creating dataset')
  })

  test('prompts user to select then create a new organization', async () => {
    // Mock no framework detection
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    // Mock listOrganizations to return existing organizations
    mocks.listOrganizations.mockResolvedValueOnce([
      {
        id: 'existing-org-123',
        name: 'Existing Organization',
        slug: 'existing-organization',
      },
    ])

    // Mock getOrganizationsWithAttachGrantInfo to return organizations with attach grant
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

    // Mock getOrganizationChoices to return choices including create new option
    mocks.getOrganizationChoices.mockReturnValueOnce([
      {name: 'Existing Organization [existing-org-123]', value: 'existing-org-123'},
      {name: 'Create new organization', value: '-new-'},
    ])

    // Mock select prompt - user chooses to create new organization
    mocks.select.mockResolvedValueOnce('-new-')

    // Mock input prompt for new organization name
    mocks.input.mockResolvedValueOnce('Brand New Organization')

    // Mock createOrganization to return the newly created organization
    mocks.createOrganization.mockResolvedValueOnce({
      createdByUserId: 'user-123',
      defaultRoleName: null,
      features: [],
      id: 'new-org-456',
      members: [],
      name: 'Brand New Organization',
      slug: 'brand-new-organization',
    })

    // Mock createProject to return the created project
    mocks.createProject.mockResolvedValueOnce({
      displayName: 'Test Project',
      projectId: 'project-123',
    })

    // Mock createDataset
    mocks.createDataset.mockResolvedValueOnce(undefined)

    // Mock spinner instance
    const mockSpinnerInstance = {
      fail: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    }
    mocks.spinner.mockReturnValue(mockSpinnerInstance)

    await testCommand(InitCommand, [
      '--create-project=Test Project',
      '--dataset=production',
      '--output-path=./test-project',
    ])

    // Verify createOrganization was called with the input value
    expect(mocks.createOrganization).toHaveBeenCalledWith('Brand New Organization')

    // Verify createProject was called
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Test Project',
        organizationId: 'new-org-456',
      }),
    )

    // Verify createDataset was called
    expect(mocks.createDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        aclMode: undefined,
        datasetName: 'production',
        projectId: 'project-123',
      }),
    )

    // Verify spinner was called with correct text
    expect(mocks.spinner).toHaveBeenCalledWith('Creating organization')
    expect(mocks.spinner).toHaveBeenCalledWith('Creating dataset')
  })
})
