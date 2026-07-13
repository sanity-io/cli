import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CreateHookCommand} from '../create.js'

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}))

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  isInteractive: true,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockGetById = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      projects: {
        getById: mockGetById,
      },
    }),
  }
})

describe('#hook:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('opens webhook creation URL for project with organization', async () => {
    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {stdout} = await testCommand(CreateHookCommand, [], {
      mocks: defaultMocks,
    })

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/organizations/test-org/project/test-project/api/webhooks/new'),
    )
    expect(stdout).toContain('/organizations/test-org/project/test-project/api/webhooks/new')
  })

  test('opens webhook creation URL for project without organization (personal)', async () => {
    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
    })

    const {stdout} = await testCommand(CreateHookCommand, [], {
      mocks: defaultMocks,
    })

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/organizations/personal/project/test-project/api/webhooks/new'),
    )
    expect(stdout).toContain('/organizations/personal/project/test-project/api/webhooks/new')
  })

  test('prints the webhook creation URL without opening a browser in unattended mode', async () => {
    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {stdout} = await testCommand(CreateHookCommand, [], {
      mocks: {...defaultMocks, isInteractive: false},
    })

    expect(open).not.toHaveBeenCalled()
    expect(stdout).toContain('/organizations/test-org/project/test-project/api/webhooks/new')
    expect(stdout).toContain('Open this URL in a browser to create the webhook.')
  })

  test('displays an error if the project fetch fails', async () => {
    mockGetById.mockRejectedValueOnce(new Error('Internal Server Error'))

    const {error} = await testCommand(CreateHookCommand, [], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch project information')
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(CreateHookCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
  })

  test('handles open failure gracefully', async () => {
    vi.mocked(open).mockRejectedValueOnce(new Error('Failed to open browser'))

    mockGetById.mockResolvedValueOnce({
      id: 'test-project',
      organizationId: 'test-org',
    })

    const {error} = await testCommand(CreateHookCommand, [], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to open browser')
  })
})
