import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../types.js'
import {validateEditorTokens} from '../validateEditorTokens.js'

const mockValidateMCPToken = vi.hoisted(() => vi.fn())

vi.mock('../../../services/mcp.js', () => ({
  validateMCPToken: mockValidateMCPToken,
}))

function makeEditor(overrides: Partial<Editor> & Pick<Editor, 'name'>): Editor {
  return {
    configPath: `/fake/${overrides.name}/config.json`,
    configured: false,
    ...overrides,
  }
}

describe('validateEditorTokens', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('does nothing when no editors have tokens', async () => {
    const editors = [
      makeEditor({name: 'Cursor'}),
      makeEditor({configured: true, name: 'Claude Code'}),
    ]

    await validateEditorTokens(editors)

    expect(mockValidateMCPToken).not.toHaveBeenCalled()
    expect(editors[0].authStatus).toBeUndefined()
    expect(editors[1].authStatus).toBeUndefined()
  })

  test('sets authStatus to valid for valid tokens', async () => {
    mockValidateMCPToken.mockResolvedValue(true)

    const editors = [
      makeEditor({configured: true, existingToken: 'valid-token', name: 'Cursor'}),
    ]

    await validateEditorTokens(editors)

    expect(mockValidateMCPToken).toHaveBeenCalledWith('valid-token')
    expect(editors[0].authStatus).toBe('valid')
  })

  test('sets authStatus to unauthorized for invalid tokens', async () => {
    mockValidateMCPToken.mockResolvedValue(false)

    const editors = [
      makeEditor({configured: true, existingToken: 'expired-token', name: 'VS Code'}),
    ]

    await validateEditorTokens(editors)

    expect(mockValidateMCPToken).toHaveBeenCalledWith('expired-token')
    expect(editors[0].authStatus).toBe('unauthorized')
  })

  test('deduplicates tokens — validates each unique token only once', async () => {
    mockValidateMCPToken.mockResolvedValue(true)

    const editors = [
      makeEditor({configured: true, existingToken: 'shared-token', name: 'Cursor'}),
      makeEditor({configured: true, existingToken: 'shared-token', name: 'VS Code'}),
      makeEditor({configured: true, existingToken: 'other-token', name: 'Zed'}),
    ]

    await validateEditorTokens(editors)

    // Two unique tokens → two API calls
    expect(mockValidateMCPToken).toHaveBeenCalledTimes(2)
    expect(mockValidateMCPToken).toHaveBeenCalledWith('shared-token')
    expect(mockValidateMCPToken).toHaveBeenCalledWith('other-token')

    // All editors sharing a token get the same status
    expect(editors[0].authStatus).toBe('valid')
    expect(editors[1].authStatus).toBe('valid')
    expect(editors[2].authStatus).toBe('valid')
  })

  test('handles mixed valid and invalid tokens', async () => {
    mockValidateMCPToken.mockImplementation(async (token: string) => {
      return token === 'good-token'
    })

    const editors = [
      makeEditor({configured: true, existingToken: 'good-token', name: 'Cursor'}),
      makeEditor({configured: true, existingToken: 'bad-token', name: 'VS Code'}),
    ]

    await validateEditorTokens(editors)

    expect(editors[0].authStatus).toBe('valid')
    expect(editors[1].authStatus).toBe('unauthorized')
  })

  test('treats network errors as unauthorized', async () => {
    mockValidateMCPToken.mockRejectedValue(new Error('Network error'))

    const editors = [
      makeEditor({configured: true, existingToken: 'some-token', name: 'Cursor'}),
    ]

    await validateEditorTokens(editors)

    expect(editors[0].authStatus).toBe('unauthorized')
  })

  test('skips editors without existingToken', async () => {
    mockValidateMCPToken.mockResolvedValue(true)

    const editors = [
      makeEditor({name: 'Cursor'}), // unconfigured, no token
      makeEditor({configured: true, name: 'VS Code'}), // configured but no token
      makeEditor({configured: true, existingToken: 'real-token', name: 'Zed'}),
    ]

    await validateEditorTokens(editors)

    expect(mockValidateMCPToken).toHaveBeenCalledTimes(1)
    expect(mockValidateMCPToken).toHaveBeenCalledWith('real-token')
    expect(editors[0].authStatus).toBeUndefined()
    expect(editors[1].authStatus).toBeUndefined()
    expect(editors[2].authStatus).toBe('valid')
  })
})
