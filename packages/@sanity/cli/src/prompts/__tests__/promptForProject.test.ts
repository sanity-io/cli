import {Separator} from '@sanity/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForProject} from '../promptForProject.js'

const mockProjectsList = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockSpinnerFail = vi.hoisted(() => vi.fn().mockReturnThis())

// Mock @sanity/cli-core with getGlobalCliClient returning a client that has
// projects.list() (used by listProjects service) and request() (used by getUserGrants service)
vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      projects: {
        list: mockProjectsList,
      },
      request: mockRequest,
    }),
    isInteractive: vi.fn().mockReturnValue(true),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: mockSelect,
    spinner: vi.fn(() => ({
      fail: mockSpinnerFail,
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
    })),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

const makeProject = (id: string, displayName: string, createdAt: string) =>
  ({createdAt, displayName, id}) as never

describe('promptForProject', () => {
  test('shows projects sorted by creation date descending', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('older', 'Older Project', '2024-01-01T00:00:00Z'),
      makeProject('newer', 'Newer Project', '2024-06-01T00:00:00Z'),
    ])
    mockSelect.mockResolvedValue('newer')

    await promptForProject()

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Newer Project (newer)', value: 'newer'},
        {name: 'Older Project (older)', value: 'older'},
      ],
      message: 'Select project',
    })
  })

  test('returns the selected project id', async () => {
    mockProjectsList.mockResolvedValue([makeProject('proj-1', 'My Project', '2024-01-01')])
    mockSelect.mockResolvedValue('proj-1')

    const result = await promptForProject()

    expect(result).toBe('proj-1')
  })

  test('does not fetch grants when no requiredPermissions provided', async () => {
    mockProjectsList.mockResolvedValue([makeProject('proj-1', 'My Project', '2024-01-01')])
    mockSelect.mockResolvedValue('proj-1')

    await promptForProject()

    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('fetches grants when requiredPermissions provided', async () => {
    mockProjectsList.mockResolvedValue([makeProject('proj-1', 'My Project', '2024-01-01')])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {
        'proj-1': {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
      },
    })
    mockSelect.mockResolvedValue('proj-1')

    await promptForProject({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })

    expect(mockRequest).toHaveBeenCalled()
  })

  test('hides projects without required permissions and shows summary', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('permitted', 'Permitted Project', '2024-06-01'),
      makeProject('denied-1', 'Denied One', '2024-03-01'),
      makeProject('denied-2', 'Denied Two', '2024-01-01'),
    ])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {
        'denied-1': {
          'sanity.project.datasets': [{grants: []}],
        },
        permitted: {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
        // denied-2 not present at all in grants
      },
    })
    mockSelect.mockResolvedValue('permitted')

    await promptForProject({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })

    const {choices} = mockSelect.mock.calls[0][0]
    expect(choices).toHaveLength(3) // 1 permitted + separator + 1 summary
    expect(choices[0]).toEqual({name: 'Permitted Project (permitted)', value: 'permitted'})
    expect(choices[1]).toBeInstanceOf(Separator)
    expect(choices[2]).toEqual({
      disabled: '(insufficient permissions)',
      name: '2 other projects hidden',
      value: '',
    })
  })

  test('shows singular "project" when only one is hidden', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('permitted', 'Permitted', '2024-06-01'),
      makeProject('denied', 'Denied', '2024-01-01'),
    ])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {
        permitted: {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
      },
    })
    mockSelect.mockResolvedValue('permitted')

    await promptForProject({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })

    const {choices} = mockSelect.mock.calls[0][0]
    expect(choices[2]).toEqual({
      disabled: '(insufficient permissions)',
      name: '1 other project hidden',
      value: '',
    })
  })

  test('shows no summary when all projects are permitted', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('proj-1', 'Project One', '2024-06-01'),
      makeProject('proj-2', 'Project Two', '2024-01-01'),
    ])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {
        'proj-1': {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
        'proj-2': {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
      },
    })
    mockSelect.mockResolvedValue('proj-1')

    await promptForProject({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })

    const {choices} = mockSelect.mock.calls[0][0]
    expect(choices).toHaveLength(2)
    expect(choices.every((c: unknown) => !(c instanceof Separator))).toBe(true)
  })

  test('throws when no projects exist', async () => {
    mockProjectsList.mockResolvedValue([])

    await expect(promptForProject()).rejects.toThrow(
      'No projects found. Create a project at https://www.sanity.io/manage',
    )
  })

  test('propagates fetch errors', async () => {
    mockProjectsList.mockRejectedValue(new Error('Network error'))

    await expect(promptForProject()).rejects.toThrow('Network error')
  })

  test('shows "Failed to fetch projects" when listProjects fails', async () => {
    mockProjectsList.mockRejectedValue(new Error('Network error'))

    await expect(promptForProject()).rejects.toThrow()
    expect(mockSpinnerFail).toHaveBeenCalledWith('Failed to fetch projects')
  })

  test('shows "Failed to fetch projects or permissions" when getUserGrants fails', async () => {
    mockProjectsList.mockResolvedValue([makeProject('proj-1', 'My Project', '2024-01-01')])
    mockRequest.mockRejectedValue(new Error('Forbidden'))

    await expect(
      promptForProject({
        requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
      }),
    ).rejects.toThrow()
    expect(mockSpinnerFail).toHaveBeenCalledWith('Failed to fetch projects or permissions')
  })

  test('throws when all projects are filtered out by permissions', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('denied-1', 'Denied One', '2024-06-01'),
      makeProject('denied-2', 'Denied Two', '2024-01-01'),
    ])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {},
    })

    await expect(
      promptForProject({
        requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
      }),
    ).rejects.toThrow('None of your projects have sufficient permissions for this operation')
  })

  test('requires all permissions for a project to be shown', async () => {
    mockProjectsList.mockResolvedValue([
      makeProject('full', 'Full Access', '2024-06-01'),
      makeProject('partial', 'Partial Access', '2024-01-01'),
    ])
    mockRequest.mockResolvedValue({
      organizations: {},
      projects: {
        full: {
          'sanity.project.datasets': [
            {
              grants: [
                {name: 'read', params: {}},
                {name: 'create', params: {}},
              ],
            },
          ],
        },
        partial: {
          'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
        },
      },
    })
    mockSelect.mockResolvedValue('full')

    await promptForProject({
      requiredPermissions: [
        {grant: 'read', permission: 'sanity.project.datasets'},
        {grant: 'create', permission: 'sanity.project.datasets'},
      ],
    })

    const {choices} = mockSelect.mock.calls[0][0]
    expect(choices[0]).toEqual({name: 'Full Access (full)', value: 'full'})
    expect(choices[2]).toEqual({
      disabled: '(insufficient permissions)',
      name: '1 other project hidden',
      value: '',
    })
  })

  test('throws NonInteractiveError in non-interactive environment without making API calls', async () => {
    const {isInteractive} = await import('@sanity/cli-core')
    vi.mocked(isInteractive).mockReturnValue(false)

    await expect(promptForProject()).rejects.toThrow(
      'Cannot run "select" prompt in a non-interactive environment',
    )
    expect(mockProjectsList).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
