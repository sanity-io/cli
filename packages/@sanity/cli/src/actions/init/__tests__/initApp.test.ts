import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {warnIfNoActiveMediaLibrary} from '../initApp.js'

const mockGetMediaLibrariesForOrganization = vi.hoisted(() => vi.fn())

vi.mock('../../../services/mediaLibraries.js', () => ({
  getMediaLibrariesForOrganization: mockGetMediaLibrariesForOrganization,
}))

const mockOutput = () => ({log: vi.fn(), warn: vi.fn()}) as unknown as Output

describe('warnIfNoActiveMediaLibrary', () => {
  afterEach(() => vi.clearAllMocks())

  test('stays quiet when the organization has an active library', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([
      {id: 'library-1', organizationId: 'org-1', status: 'active'},
    ])
    const output = mockOutput()

    await warnIfNoActiveMediaLibrary('org-1', output)

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('warns with the Manage URL when the organization has no active library', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([])
    const output = mockOutput()

    await warnIfNoActiveMediaLibrary('org-1', output)

    expect(output.warn).toHaveBeenCalledTimes(1)
    const message = vi.mocked(output.warn).mock.calls[0][0]
    expect(message).toContain('org-1 has no active Media Library')
    expect(message).toContain('/manage')
    // output.warn adds oclif's `Warning:` prefix; the message must not stack
    // its own symbol or leading newline on top of it.
    expect(message).not.toMatch(/^\s/)
    expect(message).not.toContain('⚠')
  })

  test('swallows lookup failures — the hint must never block init', async () => {
    mockGetMediaLibrariesForOrganization.mockRejectedValue(new Error('offline'))
    const output = mockOutput()

    await expect(warnIfNoActiveMediaLibrary('org-1', output)).resolves.toBeUndefined()

    expect(output.warn).not.toHaveBeenCalled()
  })
})
