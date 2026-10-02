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

  // The sanity.cli.ts fallback lives on the flag itself (fromCliConfig), so
  // the flag value is the only input here.
  test('prefers the flag value', async () => {
    await expect(
      resolveOrganizationId({
        flagOrganizationId: 'org-from-flag',
        unattended: true,
      }),
    ).resolves.toBe('org-from-flag')
    expect(mockPromptForOrganization).not.toHaveBeenCalled()
  })

  test('throws MissingOrganizationError when unattended and unresolved', async () => {
    await expect(
      resolveOrganizationId({
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
        flagOrganizationId: undefined,
        unattended: false,
      }),
    ).resolves.toBe('org-from-prompt')
  })
})
