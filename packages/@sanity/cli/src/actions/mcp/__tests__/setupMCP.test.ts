import {afterEach, describe, expect, test, vi} from 'vitest'

import {setupMCP} from '../setupMCP.js'
import {type Editor} from '../types.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockPromptForMCPSetup = vi.hoisted(() => vi.fn())
const mockValidateEditorTokens = vi.hoisted(() => vi.fn())
const mockCreateMCPToken = vi.hoisted(() => vi.fn())
const mockWriteMCPConfig = vi.hoisted(() => vi.fn())
const mockReadSkillState = vi.hoisted(() => vi.fn())

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

vi.mock('../../skills/readSkillState.js', () => ({
  readSkillState: mockReadSkillState,
}))

const mockOutput = {
  error: vi.fn() as never,
  log: vi.fn(),
  warn: vi.fn(),
}

function editor(overrides: Partial<Editor> & Pick<Editor, 'name'>): Editor {
  return {
    configPath: `/fake/${overrides.name}/config.json`,
    configured: false,
    ...overrides,
  }
}

function defaultMocks() {
  mockValidateEditorTokens.mockResolvedValue(undefined)
  mockCreateMCPToken.mockResolvedValue('test-token')
  mockWriteMCPConfig.mockResolvedValue(undefined)
  mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})
}

describe('setupMCP', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // legacy MCP-only behavior (skillsMode defaulting to 'skip')
  // -------------------------------------------------------------------------

  test('mcpMode: skip with default skillsMode skip short-circuits', async () => {
    const result = await setupMCP({mode: 'skip', output: mockOutput})

    expect(result.skipped).toBe(true)
    expect(result.skillsToInstall).toEqual([])
    expect(mockDetectAvailableEditors).not.toHaveBeenCalled()
    expect(mockReadSkillState).not.toHaveBeenCalled()
  })

  test('mcpMode: auto auto-selects actionable editors and writes configs', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({name: 'Cursor'}),
      editor({name: 'VS Code'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput})

    expect(mockPromptForMCPSetup).not.toHaveBeenCalled()
    expect(mockWriteMCPConfig).toHaveBeenCalledTimes(2)
    expect(result.configuredEditors).toEqual(['Cursor', 'VS Code'])
    expect(result.skillsToInstall).toEqual([])
    expect(result.skipped).toBe(false)
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('MCP configured for Cursor, VS Code'),
    )
  })

  test('mcpMode: prompt with skillsMode skip uses today’s message', async () => {
    defaultMocks()
    const editors = [editor({name: 'Cursor'})]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockPromptForMCPSetup.mockResolvedValue([{action: 'mcp-only', editor: editors[0]}])

    const result = await setupMCP({mode: 'prompt', output: mockOutput})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Configure Sanity MCP server?'}),
    )
    expect(result.configuredEditors).toEqual(['Cursor'])
  })

  test('uses caller-provided editors without re-detecting', async () => {
    defaultMocks()
    const editors: Editor[] = [{configPath: '/tmp/cursor', configured: false, name: 'Cursor'}]

    const result = await setupMCP({editors, mode: 'auto', output: mockOutput})

    expect(mockDetectAvailableEditors).not.toHaveBeenCalled()
    expect(result.configuredEditors).toEqual(['Cursor'])
  })

  test('returns skipped when all detected editors are already configured', async () => {
    defaultMocks()
    const editors = [
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)

    const result = await setupMCP({mode: 'auto', output: mockOutput})

    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.alreadyConfiguredEditors).toEqual(['Cursor'])
  })

  // -------------------------------------------------------------------------
  // combined flow — classification matrix
  // -------------------------------------------------------------------------

  test('mcp-and-skill: actionable editor with skill mapping, skill not installed', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor({name: 'Cursor'})])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(mockReadSkillState).toHaveBeenCalledWith({
      editors: [editor({name: 'Cursor'})],
      skillNames: ['sanity-best-practices', 'sanity-migration'],
    })
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('mcp-and-skill: skill installed already still installs after MCP write (no-op upstream)', async () => {
    defaultMocks()
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})
    mockDetectAvailableEditors.mockResolvedValue([editor({name: 'Cursor'})])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('skill-only: MCP already valid, skill missing', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(result.configuredEditors).toEqual([])
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('mcp-only: editor without a skills-CLI mapping (Zed)', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor({name: 'Zed'})])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.configuredEditors).toEqual(['Zed'])
    expect(result.skillsToInstall).toEqual([])
  })

  test('none: MCP valid + skill installed → already configured', async () => {
    defaultMocks()
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})
    mockDetectAvailableEditors.mockResolvedValue([
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.skipped).toBe(true)
    expect(result.alreadyConfiguredEditors).toEqual(['Cursor'])
    expect(result.skillsToInstall).toEqual([])
  })

  test('none: MCP valid for editor without skill mapping (Zed)', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Zed'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.skipped).toBe(true)
    expect(result.alreadyConfiguredEditors).toEqual(['Zed'])
    expect(result.skillsToInstall).toEqual([])
  })

  // -------------------------------------------------------------------------
  // masking
  // -------------------------------------------------------------------------

  test('mcpMode skip downgrades mcp-and-skill to skill-only', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor({name: 'Cursor'}), editor({name: 'Zed'})])

    const result = await setupMCP({mode: 'skip', output: mockOutput, skillsMode: 'auto'})

    // Zed (mcp-only) gets dropped; Cursor downgrades to skill-only — no MCP write
    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(result.configuredEditors).toEqual([])
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('skillsMode skip downgrades mcp-and-skill to mcp-only', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({name: 'Cursor'}),
      editor({
        authStatus: 'valid',
        configured: true,
        existingToken: 'tok',
        name: 'Claude Code',
      }),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'skip'})

    expect(mockReadSkillState).not.toHaveBeenCalled()
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skillsToInstall).toEqual([])
  })

  test('both skip short-circuits even with editors provided', async () => {
    const result = await setupMCP({
      editors: [editor({name: 'Cursor'})],
      mode: 'skip',
      output: mockOutput,
      skillsMode: 'skip',
    })

    expect(result.skipped).toBe(true)
    expect(result.skillsToInstall).toEqual([])
    expect(mockValidateEditorTokens).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // prompt + selection behavior
  // -------------------------------------------------------------------------

  test('combined prompt message used when both modes are prompt', async () => {
    defaultMocks()
    const editors = [editor({name: 'Cursor'})]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockPromptForMCPSetup.mockResolvedValue([{action: 'mcp-and-skill', editor: editors[0]}])

    await setupMCP({mode: 'prompt', output: mockOutput, skillsMode: 'prompt'})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Configure Sanity MCP and agent skills for these editors?',
      }),
    )
  })

  test('mcpMode prompt + skillsMode auto still prompts the user', async () => {
    defaultMocks()
    const editors = [editor({name: 'Cursor'})]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockPromptForMCPSetup.mockResolvedValue([{action: 'mcp-and-skill', editor: editors[0]}])

    const result = await setupMCP({mode: 'prompt', output: mockOutput, skillsMode: 'auto'})

    expect(mockPromptForMCPSetup).toHaveBeenCalled()
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('mcpMode skip + skillsMode auto auto-selects skill-only without prompting', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ])

    const result = await setupMCP({mode: 'skip', output: mockOutput, skillsMode: 'auto'})

    expect(mockPromptForMCPSetup).not.toHaveBeenCalled()
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('skill-only prompt message used when mcpMode is skip + skillsMode is prompt', async () => {
    defaultMocks()
    const editors = [
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ]
    mockDetectAvailableEditors.mockResolvedValue(editors)
    mockPromptForMCPSetup.mockResolvedValue([{action: 'skill-only', editor: editors[0]}])

    const result = await setupMCP({mode: 'skip', output: mockOutput, skillsMode: 'prompt'})

    expect(mockPromptForMCPSetup).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Install Sanity agent skills for these editors?'}),
    )
    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('user deselects all → no MCP writes, no skillsToInstall', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor({name: 'Cursor'})])
    mockPromptForMCPSetup.mockResolvedValue(null)

    const result = await setupMCP({mode: 'prompt', output: mockOutput, skillsMode: 'prompt'})

    expect(mockWriteMCPConfig).not.toHaveBeenCalled()
    expect(result.skillsToInstall).toEqual([])
    expect(result.skipped).toBe(true)
    expect(mockOutput.log).toHaveBeenCalledWith('MCP configuration skipped')
  })

  // -------------------------------------------------------------------------
  // failure handling
  // -------------------------------------------------------------------------

  test('MCP write failure excludes the failing editor from skillsToInstall', async () => {
    defaultMocks()
    const cursor = editor({name: 'Cursor'})
    const claudeCode = editor({name: 'Claude Code'})
    mockDetectAvailableEditors.mockResolvedValue([cursor, claudeCode])
    mockWriteMCPConfig.mockImplementation(async (e: Editor) => {
      if (e.name === 'Cursor') throw new Error('disk full')
    })

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.configuredEditors).toEqual(['Claude Code'])
    expect(result.skillsToInstall).toEqual(['claude-code'])
    expect(result.error).toBeInstanceOf(Error)
    expect(mockOutput.warn).toHaveBeenCalledWith('Could not configure MCP for Cursor: disk full')
  })

  test('skill state probe failure → over-install (treat all as not installed)', async () => {
    defaultMocks()
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})
    mockDetectAvailableEditors.mockResolvedValue([
      editor({authStatus: 'valid', configured: true, existingToken: 'tok', name: 'Cursor'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.skillsToInstall).toEqual(['cursor'])
  })

  test('dedups multiple editors mapping to the same skills-CLI agent', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([
      editor({name: 'VS Code'}),
      editor({name: 'VS Code Insiders'}),
    ])

    const result = await setupMCP({mode: 'auto', output: mockOutput, skillsMode: 'auto'})

    expect(result.skillsToInstall).toEqual(['github-copilot'])
  })
})
