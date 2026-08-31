import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForOrganization} from '../promptForOrganization.js'

const mockListOrganizations = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())

vi.mock('../../services/organizations.js', () => ({
  listOrganizations: mockListOrganizations,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, select: mockSelect}
})

describe('promptForOrganization', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lets the user select from their organizations', async () => {
    mockListOrganizations.mockResolvedValue([
      {id: 'org-abc123', name: 'Acme', slug: 'acme'},
      {id: 'org-def456', name: 'Umbrella', slug: null},
    ])
    mockSelect.mockResolvedValue('org-def456')

    await expect(promptForOrganization()).resolves.toBe('org-def456')
    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Acme (org-abc123)', value: 'org-abc123'},
        {name: 'Umbrella (org-def456)', value: 'org-def456'},
      ],
      message: 'Select organization:',
    })
  })

  test('throws when the user has no organizations', async () => {
    mockListOrganizations.mockResolvedValue([])

    await expect(promptForOrganization()).rejects.toThrow('No organizations found')
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
