import {input} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DeleteOrganizationCommand} from '../delete.js'

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
    input: vi.fn(),
    spinner: vi
      .fn()
      .mockReturnValue({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()}),
  }
})

const mockInput = vi.mocked(input)

const org = {
  createdAt: '2024-01-01T00:00:00Z',
  defaultRoleName: null,
  id: 'org-aaa',
  name: 'Acme Corp',
  slug: 'acme-corp',
  updatedAt: '2026-03-18T00:00:00Z',
}

describe('organizations delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes organization after typing org name', async () => {
    mockRequest.mockResolvedValueOnce(org).mockResolvedValueOnce({deleted: true})
    mockInput.mockResolvedValue(org.name)

    const {error, stdout} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    if (error) throw error
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Type the name of the organization'),
        validate: expect.any(Function),
      }),
    )
    expect(stdout).toContain('Organization deleted')
  })

  test('skips confirmation with --force flag', async () => {
    mockRequest.mockResolvedValue({deleted: true})

    const {error, stderr} = await testCommand(DeleteOrganizationCommand, ['org-aaa', '--force'])

    if (error) throw error
    expect(mockInput).not.toHaveBeenCalled()
    expect(stderr).toContain(`--force' used: skipping confirmation`)
  })

  test('errors when user cancels the input prompt', async () => {
    mockRequest.mockResolvedValueOnce(org)
    mockInput.mockRejectedValue(new Error('User cancelled'))

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires organizationId argument', async () => {
    const {error} = await testCommand(DeleteOrganizationCommand, [])

    expect(error).toBeInstanceOf(Error)
  })

  test('shows user-friendly error when org is not found during fetch', async () => {
    const apiError = Object.assign(new Error('Not found'), {statusCode: 404})
    mockRequest.mockRejectedValue(apiError)

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization "org-aaa" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when org retrieval fails', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization retrieval failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows user-friendly error on 404 during delete', async () => {
    mockRequest.mockResolvedValueOnce(org)
    mockInput.mockResolvedValue(org.name)
    const apiError = Object.assign(new Error('Not found'), {statusCode: 404})
    mockRequest.mockRejectedValueOnce(apiError)

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Type the name of the organization'),
        validate: expect.any(Function),
      }),
    )
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization "org-aaa" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when delete API call fails', async () => {
    mockRequest.mockResolvedValueOnce(org)
    mockInput.mockResolvedValue(org.name)
    const apiError = Object.assign(new Error('Organization has projects'), {statusCode: 409})
    mockRequest.mockRejectedValueOnce(apiError)

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Type the name of the organization'),
        validate: expect.any(Function),
      }),
    )
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete organization')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when --force is used without organizationId', async () => {
    const {error} = await testCommand(DeleteOrganizationCommand, ['--force'])

    expect(error).toBeInstanceOf(Error)
  })
})
