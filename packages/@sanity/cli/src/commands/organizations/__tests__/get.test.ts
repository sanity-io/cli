import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GetOrganizationCommand} from '../get.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockRequest,
    }),
  }
})

const organization = {
  createdAt: '2024-01-15T10:00:00Z',
  defaultRoleName: 'viewer',
  id: 'org-aaa',
  name: 'Acme Corp',
  slug: 'acme',
  updatedAt: '2024-06-01T12:00:00Z',
}

describe('organizations get', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('displays organization details', async () => {
    mockRequest.mockResolvedValue(organization)

    const {error, stdout} = await testCommand(GetOrganizationCommand, ['org-aaa'])

    if (error) throw error
    expect(stdout).toContain('org-aaa')
    expect(stdout).toContain('Acme Corp')
    expect(stdout).toContain('acme')
    expect(stdout).toContain('viewer')
  })

  test('requires orgId argument', async () => {
    const {error} = await testCommand(GetOrganizationCommand, [])

    expect(error).toBeInstanceOf(Error)
  })

  test('errors when organization not found', async () => {
    const notFound = Object.assign(new Error('Not found'), {statusCode: 404})
    mockRequest.mockRejectedValue(notFound)

    const {error} = await testCommand(GetOrganizationCommand, ['org-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('org-missing')
  })

  test('errors on generic API failure', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(GetOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get organization')
  })
})
