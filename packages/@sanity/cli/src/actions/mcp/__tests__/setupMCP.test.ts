import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setupMCP} from '../setupMCP.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockPromptForMCPSetup = vi.hoisted(() => vi.fn())
const mockValidateEditorTokens = vi.hoisted(() => vi.fn())
const mockCreateMCPToken = vi.hoisted(() => vi.fn())
const mockWriteMCPConfig = vi.hoisted(() => vi.fn())
const mockSetupSkills = vi.hoisted(() => vi.fn())

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

vi.mock('../../skills/setupSkills.js', () => ({
  setupSkills: mockSetupSkills,
}))

describe('setupMCP', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // Default skills mock to a no-op success so existing tests don't have to set it
  beforeEach(() => {
    mockSetupSkills.mockResolvedValue({installedAgents: [], skipped: true})
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

  test('invokes setupSkills with the configured editors after a successful MCP setup when cwd is provided', async () => {
    const editors = [
      {authStatus: 'unknown', configured: false, name: 'Cursor'},
      {authStatus: 'unknown', configured: false, name: 'Claude Code'},
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(undefined)
    mockSetupSkills.mockResolvedValue({
      installedAgents: ['cursor', 'claude-code'],
      skipped: false,
    })

    const result = await setupMCP({cwd: '/tmp/project', mode: 'auto'})

    expect(mockSetupSkills).toHaveBeenCalledTimes(1)
    expect(mockSetupSkills).toHaveBeenCalledWith({cwd: '/tmp/project', editors})
    expect(result.installedSkillsCliAgents).toEqual(['cursor', 'claude-code'])
    expect(result.skillsError).toBeUndefined()
  })

  test('does not invoke setupSkills when cwd is not provided (e.g. sanity mcp configure)', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'auto'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(result.installedSkillsCliAgents).toEqual([])
    expect(result.skillsError).toBeUndefined()
  })

  test('surfaces skills install error without failing MCP setup', async () => {
    const editors = [{authStatus: 'unknown', configured: false, name: 'Cursor'}]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockCreateMCPToken.mockResolvedValue('test-token')
    mockWriteMCPConfig.mockResolvedValue(undefined)
    const skillsError = new Error('skills install failed')
    mockSetupSkills.mockResolvedValue({
      error: skillsError,
      installedAgents: [],
      skipped: false,
    })

    const result = await setupMCP({cwd: '/tmp/project', mode: 'auto'})

    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skipped).toBe(false)
    expect(result.installedSkillsCliAgents).toEqual([])
    expect(result.skillsError).toBe(skillsError)
  })

  test('does not invoke setupSkills when no editors are detected', async () => {
    mockDetectAvailableEditors.mockResolvedValue([])

    await setupMCP({cwd: '/tmp/project', mode: 'auto'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
  })

  test('still installs skills for already-MCP-configured editors during init (cwd provided)', async () => {
    const editors = [
      {
        authStatus: 'valid',
        configured: true,
        existingToken: 'tok',
        name: 'Cursor',
      },
      {
        authStatus: 'valid',
        configured: true,
        existingToken: 'tok',
        name: 'Claude Code',
      },
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)
    mockPromptForMCPSetup.mockImplementation(async (eds) => eds)
    mockSetupSkills.mockResolvedValue({
      installedAgents: ['cursor', 'claude-code'],
      skipped: false,
    })

    const result = await setupMCP({cwd: '/tmp/project', mode: 'auto'})

    // No MCP writes needed — already configured
    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(mockCreateMCPToken).not.toHaveBeenCalled()
    // But skills still installed for both editors
    expect(mockSetupSkills).toHaveBeenCalledWith({cwd: '/tmp/project', editors})
    expect(result.installedSkillsCliAgents).toEqual(['cursor', 'claude-code'])
    expect(result.configuredEditors).toEqual([])
  })

  test('skips already-MCP-configured editors during sanity mcp configure (no cwd)', async () => {
    const editors = [
      {
        authStatus: 'valid',
        configured: true,
        existingToken: 'tok',
        name: 'Cursor',
      },
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockValidateEditorTokens.mockResolvedValue(undefined)

    const result = await setupMCP({mode: 'auto'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.alreadyConfiguredEditors).toEqual(['Cursor'])
  })
})
