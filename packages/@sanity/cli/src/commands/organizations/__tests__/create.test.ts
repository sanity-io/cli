import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CreateOrganizationCommand} from '../create.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockRequest,
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: mockInput,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

const createdOrg = {
  createdAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'user-123',
  defaultRoleName: null,
  features: [],
  id: 'org-new',
  members: [],
  name: 'My Org',
  slug: null,
  telemetryConsentStatus: 'allowed',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('organizations create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates organization with --name flag', async () => {
    mockRequest.mockResolvedValue(createdOrg)

    const {error, stdout} = await testCommand(CreateOrganizationCommand, ['--name', 'My Org'])

    if (error) throw error
    expect(stdout).toContain('org-new')
    expect(stdout).toContain('My Org')
  })

  test('creates organization with --name flag and --default-role flag', async () => {
    mockRequest.mockResolvedValue({...createdOrg, defaultRoleName: 'viewer'})

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--default-role',
      'viewer',
    ])

    if (error) throw error
    expect(stdout).toContain('org-new')
  })

  test('prompts for name when arg is not provided', async () => {
    mockInput.mockResolvedValue('Prompted Org')
    mockRequest.mockResolvedValue({...createdOrg, name: 'Prompted Org'})

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [])

    if (error) throw error
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Organization name:',
        validate: expect.any(Function),
      }),
    )
    expect(stdout).toContain('org-new')
  })

  test('errors when --name flag is empty', async () => {
    const {error} = await testCommand(CreateOrganizationCommand, ['--name', ''])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when --name flag exceeds 100 characters', async () => {
    const longName = 'a'.repeat(101)
    const {error} = await testCommand(CreateOrganizationCommand, ['--name', longName])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be longer than 100 characters')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockRequest.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateOrganizationCommand, ['--name', 'My Org'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create organization')
    expect(error?.oclif?.exit).toBe(1)
  })
})
