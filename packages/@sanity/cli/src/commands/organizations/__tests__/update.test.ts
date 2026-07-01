import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {UpdateOrganizationCommand} from '../update.js'
import {httpError} from './httpError.js'

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
      .mockReturnValue({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()}),
  }
})

const updatedOrg = {
  createdAt: '2024-01-01T00:00:00Z',
  defaultRoleName: null,
  id: 'org-aaa',
  name: 'New Name',
  slug: 'new-slug',
  updatedAt: '2026-03-18T00:00:00Z',
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
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'New Name'},
      method: 'patch',
      uri: '/organizations/org-aaa',
    })
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
    expect(mockRequest).toHaveBeenCalledWith({
      body: {slug: 'new-slug'},
      method: 'patch',
      uri: '/organizations/org-aaa',
    })
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
    expect(mockRequest).toHaveBeenCalledWith({
      body: {defaultRoleName: 'viewer', name: 'New Name', slug: 'new-slug'},
      method: 'patch',
      uri: '/organizations/org-aaa',
    })
  })

  test('trims name and slug before sending', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      '  New Name  ',
      '--slug',
      '  new-slug  ',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'New Name', slug: 'new-slug'},
      method: 'patch',
      uri: '/organizations/org-aaa',
    })
  })

  test('errors when --default-role flag is empty', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--default-role',
      '  ',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Default role cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('errors when no flags are provided', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('At least one of the following must be provided')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('requires organizationId argument', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['--name', 'Foo'])

    expect(error).toBeInstanceOf(Error)
  })

  test('validates name flag', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--name', '   '])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows user-friendly error on 404', async () => {
    mockRequest.mockRejectedValue(httpError(404, 'Not found'))

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--name', 'New Name'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization "org-aaa" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('validates slug flag', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--slug',
      'Invalid Slug!',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('must be lowercase')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('surfaces API error (e.g. slug requires authSAML feature)', async () => {
    mockRequest.mockRejectedValue(httpError(403, 'Slug requires SAML'))

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--slug', 'my-slug'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to update organization')
    expect(error?.oclif?.exit).toBe(1)
  })
})
