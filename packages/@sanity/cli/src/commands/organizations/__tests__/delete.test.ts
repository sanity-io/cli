import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DeleteOrganizationCommand} from '../delete.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())

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
    confirm: mockConfirm,
    spinner: vi
      .fn()
      .mockReturnValue({fail: vi.fn(), succeed: vi.fn(), start: vi.fn().mockReturnThis()}),
  }
})

describe('organizations delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes organization after confirmation', async () => {
    mockConfirm.mockResolvedValue(true)
    mockRequest.mockResolvedValue({deleted: true})

    const {error, stdout} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalled()
    expect(stdout).toContain('Organization deleted')
  })

  test('skips confirmation with --yes flag', async () => {
    mockRequest.mockResolvedValue({deleted: true})

    const {error, stdout} = await testCommand(DeleteOrganizationCommand, ['org-aaa', '--yes'])

    if (error) throw error
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(stdout).toContain('Organization deleted')
  })

  test('cancels when user declines confirmation', async () => {
    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('cancelled')
  })

  test('requires orgId argument', async () => {
    const {error} = await testCommand(DeleteOrganizationCommand, [])

    expect(error).toBeInstanceOf(Error)
  })

  test('errors when API call fails', async () => {
    mockConfirm.mockResolvedValue(true)
    const apiError = Object.assign(new Error('Organization has projects'), {statusCode: 409})
    mockRequest.mockRejectedValue(apiError)

    const {error} = await testCommand(DeleteOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete organization')
  })

  test('errors when --yes is used without orgId', async () => {
    const {error} = await testCommand(DeleteOrganizationCommand, ['--yes'])

    expect(error).toBeInstanceOf(Error)
  })
})
