import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {SANITY_SKILLS_REPO, setupSkills} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())
const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockPromptForSkillsSetup = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

vi.mock('../../mcp/detectAvailableEditors.js', () => ({
  detectAvailableEditors: mockDetectAvailableEditors,
}))

vi.mock('../promptForSkillsSetup.js', () => ({
  promptForSkillsSetup: mockPromptForSkillsSetup,
}))

function editor(name: Editor['name']): Editor {
  return {configPath: `/tmp/${name}.json`, configured: false, name}
}

const PROJECT_DIR = '/tmp/project'

describe('setupSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('mode: skip returns early without detecting or prompting', async () => {
    const result = await setupSkills({cwd: PROJECT_DIR, mode: 'skip'})

    expect(result).toEqual({installedAgents: [], installedForEditors: [], skipped: true})
    expect(mockDetectAvailableEditors).not.toHaveBeenCalled()
    expect(mockPromptForSkillsSetup).not.toHaveBeenCalled()
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('skips when no detected editors have a skills agent mapping', async () => {
    // Zed and MCPorter do not have a skillsCliAgent mapping
    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Zed'), editor('MCPorter')],
      mode: 'auto',
    })

    expect(result).toEqual({installedAgents: [], installedForEditors: [], skipped: true})
    expect(mockPromptForSkillsSetup).not.toHaveBeenCalled()
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('mode: auto installs for all eligible editors without prompting', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Cursor'), editor('Claude Code')],
      mode: 'auto',
    })

    expect(mockPromptForSkillsSetup).not.toHaveBeenCalled()
    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'cursor', '-a', 'claude-code', '-y'],
      expect.objectContaining({cwd: PROJECT_DIR, stdio: 'pipe'}),
    )
    expect(result.installedAgents).toEqual(['cursor', 'claude-code'])
    expect(result.installedForEditors).toEqual(['Cursor', 'Claude Code'])
    expect(result.skipped).toBe(false)
    expect(result.error).toBeUndefined()
  })

  test('mode: prompt asks the user with a single confirm', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})
    mockPromptForSkillsSetup.mockResolvedValue(true)

    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Cursor'), editor('Zed'), editor('Claude Code')],
      mode: 'prompt',
    })

    expect(mockPromptForSkillsSetup).toHaveBeenCalledTimes(1)
    expect(result.installedAgents).toEqual(['cursor', 'claude-code'])
    expect(result.skipped).toBe(false)
  })

  test('mode: prompt returns skipped when the user declines', async () => {
    mockPromptForSkillsSetup.mockResolvedValue(false)

    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Cursor')],
      mode: 'prompt',
    })

    expect(mockExeca).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.installedAgents).toEqual([])
  })

  test('deduplicates agents (Cline and Cline CLI map to the same agent)', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Cline'), editor('Cline CLI')],
      mode: 'auto',
    })

    expect(result.installedAgents).toEqual(['cline'])
    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'cline', '-y'],
      expect.any(Object),
    )
  })

  test('detects editors when not provided by caller', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])

    await setupSkills({cwd: PROJECT_DIR, mode: 'auto'})

    expect(mockDetectAvailableEditors).toHaveBeenCalled()
    expect(mockExeca).toHaveBeenCalled()
  })

  test('returns an error result when npx fails (does not throw)', async () => {
    const installErr = new Error('npx exited 1')
    mockExeca.mockRejectedValue(installErr)

    const result = await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('Cursor')],
      mode: 'auto',
    })

    expect(result.skipped).toBe(false)
    expect(result.installedAgents).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('npx exited 1')
  })

  test('VS Code maps to github-copilot agent', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    await setupSkills({
      cwd: PROJECT_DIR,
      editors: [editor('VS Code'), editor('VS Code Insiders')],
      mode: 'auto',
    })

    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'github-copilot', '-y'],
      expect.any(Object),
    )
  })
})
