import {afterEach, describe, expect, test, vi} from 'vitest'

import {setupMCP} from '../setupMCP.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockPromptForMCPSetup = vi.hoisted(() => vi.fn())
const mockValidateEditorTokens = vi.hoisted(() => vi.fn())
const mockCreateMCPToken = vi.hoisted(() => vi.fn())
const mockWriteMCPConfig = vi.hoisted(() => vi.fn())

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
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(undefined)

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
    mockWriteMCPConfig.mockResolvedValue(undefined)

    await setupMCP()

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })

  test('defaults to prompt mode when options provided without mode', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockResolvedValue(editors)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(undefined)

    await setupMCP({explicit: true})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(editors)
  })
})
