import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {UpdateOrganizationCommand} from '../update.js'

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

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    spinner: vi
      .fn()
      .mockReturnValue({fail: vi.fn(), succeed: vi.fn(), start: vi.fn().mockReturnThis()}),
  }
})

const updatedOrg = {
  id: 'org-aaa',
  name: 'New Name',
  slug: 'new-slug',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2026-03-18T00:00:00Z',
  defaultRoleName: null,
}

describe('organizations update', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('updates organization name', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
  })

  test('updates organization slug', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--slug',
      'new-slug',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
  })

  test('updates multiple fields at once', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
      '--slug',
      'new-slug',
      '--default-role',
      'viewer',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
  })

  test('errors when no flags are provided', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('at least one')
  })

  test('requires orgId argument', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['--name', 'Foo'])

    expect(error).toBeInstanceOf(Error)
  })

  test('surfaces API error (e.g. slug requires authSAML feature)', async () => {
    const apiError = Object.assign(new Error('Slug requires SAML'), {statusCode: 403})
    mockRequest.mockRejectedValue(apiError)

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--slug', 'my-slug'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to update organization')
  })
})
