import {afterEach, describe, expect, test, vi} from 'vitest'

import {setupMCP} from '../setupMCP.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockPromptForMCPSetup = vi.hoisted(() => vi.fn())
const mockValidateEditorTokens = vi.hoisted(() => vi.fn())
const mockCreateMCPToken = vi.hoisted(() => vi.fn())
const mockWriteMCPConfig = vi.hoisted(() => vi.fn())
const mockRemoveMCPConfig = vi.hoisted(() => vi.fn())

vi.mock('../detectAvailableEditors.js', () => ({
  detectAvailableEditors: mockDetectAvailableEditors,
}))

vi.mock('../promptForMCPSetup.js', () => ({
  promptForMCPSetup: mockPromptForMCPSetup,
}))

vi.mock('../validateEditorTokens.js', () => ({
  validateEditorTokens: mockValidateEditorTokens,
}))

vi.mock('../../../services/mcp.js', () => ({
  createMCPToken: mockCreateMCPToken,
  MCP_SERVER_URL: 'https://mcp.sanity.io',
}))

vi.mock('../writeMCPConfig.js', () => ({
  writeMCPConfig: mockWriteMCPConfig,
}))

vi.mock('../removeMCPConfig.js', () => ({
  removeMCPConfig: mockRemoveMCPConfig,
}))

describe('setupMCP', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('mode: skip returns early without detecting editors', async () => {
    const result = await setupMCP({mode: 'skip'})

    expect(result.skipped).toBe(true)
    expect(result.configuredEditors).toEqual([])
    expect(result.detectedEditors).toEqual([])
    expect(mockDetectAvailableEditors).not.toHaveBeenCalled()
  })

  test('mode: auto auto-selects all actionable editors without prompting', async () => {
    mockDetectAvailableEditors.mockResolvedValue([
      {authStatus: 'unknown', configured: false, name: 'Cursor'},
      {authStatus: 'unknown', configured: false, name: 'VS Code'},
    ])
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(true)

    const result = await setupMCP({mode: 'auto'})

    expect(mockPromptForMCPSetup).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).toHaveBeenCalledTimes(2)
    expect(result.configuredEditors).toEqual(['Cursor', 'VS Code'])
    expect(result.skipped).toBe(false)
  })

  test('mode: prompt calls promptForMCPSetup', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(true)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skipped).toBe(false)
  })

  test('defaults to prompt mode when no mode specified', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(true)

    await setupMCP()

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })

  test('defaults to prompt mode when options provided without mode', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(true)

    await setupMCP({explicit: true})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })

  test('reports an editor whose config already matches as already-configured (no write needed)', async () => {
    // VS Code is configured with a valid bearer token. writeMCPConfig returns
    // false to signal a no-op — setupMCP should classify this as
    // "alreadyConfigured" rather than "configured".
    const vscode = {
      authStatus: 'valid',
      configured: true,
      existingToken: 'valid-token',
      name: 'VS Code',
    }
    mockDetectAvailableEditors.mockResolvedValue([vscode])
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue([vscode])
    mockWriteMCPConfig.mockResolvedValue(false)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockCreateMCPToken).not.toHaveBeenCalled()
    expect(result.configuredEditors).toEqual([])
    expect(result.alreadyConfiguredEditors).toEqual(['VS Code'])
  })

  test('reports an editor whose config needed rewriting as configured', async () => {
    // Existing config shape diverges from what writeMCPConfig would produce
    // (e.g. oauthOnly toggled, token changed). writeMCPConfig returns true to
    // signal it wrote.
    const cursor = {
      authStatus: 'valid',
      configured: true,
      existingToken: 'stale-bearer-token',
      name: 'Cursor',
    }
    mockDetectAvailableEditors.mockResolvedValue([cursor])
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue([cursor])
    mockWriteMCPConfig.mockResolvedValue(true)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockWriteMCPConfig).toHaveBeenCalled()
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.alreadyConfiguredEditors).toEqual([])
  })

  test('removes Sanity entry from configured editors that the user deselects', async () => {
    const cursor = {
      authStatus: 'valid',
      configured: true,
      existingToken: 'existing-token',
      name: 'Cursor',
    }
    const vscode = {authStatus: 'unknown', configured: false, name: 'VS Code'}
    mockDetectAvailableEditors.mockResolvedValue([cursor, vscode])
    mockValidateEditorTokens.mockResolvedValue(undefined)
    // User keeps VS Code, drops Cursor
    mockPromptForMCPSetup.mockResolvedValue([vscode])
    mockWriteMCPConfig.mockResolvedValue(true)
    mockRemoveMCPConfig.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'prompt'})

    // Reuses Cursor's still-valid token for the new VS Code write
    expect(mockCreateMCPToken).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).toHaveBeenCalledWith(vscode, 'existing-token')
    expect(mockRemoveMCPConfig).toHaveBeenCalledWith(cursor)
    expect(result.configuredEditors).toEqual(['VS Code'])
    expect(result.removedEditors).toEqual(['Cursor'])
  })
})
