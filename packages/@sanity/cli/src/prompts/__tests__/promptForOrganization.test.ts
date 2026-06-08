import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForOrganization} from '../promptForOrganization.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockSpinnerFail = vi.hoisted(() => vi.fn().mockReturnThis())
const mockSpinnerSucceed = vi.hoisted(() => vi.fn().mockReturnThis())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
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
      succeed: mockSpinnerSucceed,
    })),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

const makeOrg = (id: string, name: string) => ({id, name}) as never

describe('promptForOrganization', () => {
  test('returns the selected organization id', async () => {
    mockRequest.mockResolvedValue([makeOrg('org-1', 'My Org')])
    mockSelect.mockResolvedValue('org-1')

    const result = await promptForOrganization()

    expect(result).toBe('org-1')
  })

  test('renders each org as "name (id)" in the select prompt', async () => {
    mockRequest.mockResolvedValue([makeOrg('org-a', 'Alpha'), makeOrg('org-b', 'Beta')])
    mockSelect.mockResolvedValue('org-b')

    await promptForOrganization()

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Alpha (org-a)', value: 'org-a'},
        {name: 'Beta (org-b)', value: 'org-b'},
      ],
      message: 'Select organization',
    })
  })

  test('succeeds the spinner after a successful fetch', async () => {
    mockRequest.mockResolvedValue([makeOrg('org-1', 'My Org')])
    mockSelect.mockResolvedValue('org-1')

    await promptForOrganization()

    expect(mockSpinnerSucceed).toHaveBeenCalled()
    expect(mockSpinnerFail).not.toHaveBeenCalled()
  })

  test('fails the spinner and throws when listOrganizations rejects', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'))

    await expect(promptForOrganization()).rejects.toThrow('Network error')
    expect(mockSpinnerFail).toHaveBeenCalledWith('Failed to fetch organizations')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('fails the spinner and throws when no organizations exist', async () => {
    mockRequest.mockResolvedValue([])

    await expect(promptForOrganization()).rejects.toThrow(
      'No organizations found. Create one at https://www.sanity.io/manage',
    )
    expect(mockSpinnerFail).toHaveBeenCalledWith('No organizations found')
    expect(mockSelect).not.toHaveBeenCalled()
  })

  test('throws NonInteractiveError without making API calls in non-interactive env', async () => {
    const {isInteractive} = await import('@sanity/cli-core')
    vi.mocked(isInteractive).mockReturnValue(false)

    await expect(promptForOrganization()).rejects.toThrow(
      'Cannot run "select" prompt in a non-interactive environment',
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
