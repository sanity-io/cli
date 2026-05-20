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

function setupPromptedEditors(editors: unknown[]): void {
  mockDetectAvailableEditors.mockResolvedValue(editors)
  mockValidateEditorTokens.mockResolvedValue(undefined)
  mockPromptForMCPSetup.mockResolvedValue(editors)
  mockCreateMCPToken.mockResolvedValue('test-token')
  mockWriteMCPConfig.mockResolvedValue(undefined)
}

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
    mockWriteMCPConfig.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'auto'})

    expect(mockPromptForMCPSetup).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).toHaveBeenCalledTimes(2)
    expect(result.configuredEditors).toEqual(['Cursor', 'VS Code'])
    expect(result.skipped).toBe(false)
  })

  test('mode: prompt calls promptForMCPSetup', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    setupPromptedEditors(editors)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skipped).toBe(false)
  })

  test('defaults to prompt mode when no mode specified', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    setupPromptedEditors(editors)

    await setupMCP()

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })

  test('defaults to prompt mode when options provided without mode', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    setupPromptedEditors(editors)

    await setupMCP({explicit: true})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })

  test('does not rewrite editors that are already valid and still selected', async () => {
    const editors = [
      {
        authStatus: 'valid',
        configured: true,
        existingToken: 'reusable-token',
        name: 'Cursor',
      },
      {configured: false, name: 'VS Code'},
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockWriteMCPConfig.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
    expect(mockCreateMCPToken).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).toHaveBeenCalledTimes(1)
    expect(mockWriteMCPConfig).toHaveBeenCalledWith(editors[1], 'reusable-token')
    expect(mockRemoveMCPConfig).not.toHaveBeenCalled()
    expect(result.alreadyConfiguredEditors).toEqual(['Cursor'])
    expect(result.configuredEditors).toEqual(['VS Code'])
  })

  test('removes configured editors that are deselected', async () => {
    const cursor = {
      authStatus: 'valid',
      configured: true,
      existingToken: 'existing-token',
      name: 'Cursor',
    }
    const vscode = {configured: false, name: 'VS Code'}
    const editors = [cursor, vscode]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue([vscode])
    mockWriteMCPConfig.mockResolvedValue(undefined)
    mockRemoveMCPConfig.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'prompt'})

    expect(mockWriteMCPConfig).toHaveBeenCalledWith(vscode, 'existing-token')
    expect(mockRemoveMCPConfig).toHaveBeenCalledWith(cursor)
    expect(result.alreadyConfiguredEditors).toEqual([])
    expect(result.configuredEditors).toEqual(['VS Code'])
    expect(result.removedEditors).toEqual(['Cursor'])
  })
})
