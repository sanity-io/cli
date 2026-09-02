import {afterEach, describe, expect, test, vi} from 'vitest'

import {MissingOrganizationError, resolveOrganizationId} from '../resolveOrganizationId.js'

const mockPromptForOrganization = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForOrganization.js', () => ({
  promptForOrganization: mockPromptForOrganization,
}))

describe('resolveOrganizationId', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prefers the flag value', async () => {
    await expect(
      resolveOrganizationId({
        configuredOrganizationId: 'org-from-config',
        flagOrganizationId: 'org-from-flag',
        unattended: true,
      }),
    ).resolves.toBe('org-from-flag')
    expect(mockPromptForOrganization).not.toHaveBeenCalled()
  })

  test('falls back to the configured organization', async () => {
    await expect(
      resolveOrganizationId({
        configuredOrganizationId: 'org-from-config',
        flagOrganizationId: undefined,
        unattended: true,
      }),
    ).resolves.toBe('org-from-config')
  })

  test('throws MissingOrganizationError when unattended and unresolved', async () => {
    await expect(
      resolveOrganizationId({
        configuredOrganizationId: undefined,
        flagOrganizationId: undefined,
        unattended: true,
      }),
    ).rejects.toBeInstanceOf(MissingOrganizationError)
    expect(mockPromptForOrganization).not.toHaveBeenCalled()
  })

  test('prompts when interactive and unresolved', async () => {
    mockPromptForOrganization.mockResolvedValue('org-from-prompt')

    await expect(
      resolveOrganizationId({
        configuredOrganizationId: undefined,
        flagOrganizationId: undefined,
        unattended: false,
      }),
    ).resolves.toBe('org-from-prompt')
  })
})
