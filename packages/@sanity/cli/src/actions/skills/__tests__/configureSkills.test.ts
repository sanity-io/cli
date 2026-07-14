import {createMockOutput} from '@sanity/cli-test/test/util'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {configureSkills} from '../configureSkills.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockSetupSkills = vi.hoisted(() => vi.fn())

vi.mock('../../mcp/detectAvailableEditors.js', () => ({
  detectAvailableEditors: mockDetectAvailableEditors,
}))

vi.mock('../setupSkills.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../setupSkills.js')>()
  return {
    ...actual,
    setupSkills: mockSetupSkills,
  }
})

function editor(name: Editor['name']): Editor {
  return {configPath: `/fake/${name}/config.json`, configured: false, name}
}

const mockOutput = createMockOutput()

describe('configureSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('forwards every detected agent to setupSkills without prompting', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor'), editor('Codex CLI')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor', 'codex'], skipped: false})

    const result = await configureSkills({output: mockOutput})

    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['cursor', 'codex'], output: mockOutput})
    expect(result.installedAgents).toEqual(['cursor', 'codex'])
    expect(result.detectedEditors).toEqual(['Cursor', 'Codex CLI'])
    expect(result.skipped).toBe(false)
  })

  test('dedupes agents shared across multiple editors', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('VS Code'), editor('GitHub Copilot CLI')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['github-copilot'], skipped: false})

    await configureSkills({output: mockOutput})

    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['github-copilot'], output: mockOutput})
  })

  test('re-runs setupSkills even when skills are already installed (updates in place)', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor'], skipped: false})

    const result = await configureSkills({output: mockOutput})

    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['cursor'], output: mockOutput})
    expect(result.skipped).toBe(false)
    expect(result.installedAgents).toEqual(['cursor'])
  })

  test('skips when no detected editor supports skills', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('Zed')])

    const result = await configureSkills({output: mockOutput})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(mockOutput.warn).toHaveBeenCalledTimes(1)
    expect(result.skipped).toBe(true)
    expect(result.detectedEditors).toEqual(['Zed'])
  })

  test('surfaces install errors without throwing', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    const installErr = new Error('skills exited 1')
    mockSetupSkills.mockResolvedValue({error: installErr, installedAgents: [], skipped: false})

    const result = await configureSkills({output: mockOutput})

    expect(result.error).toBe(installErr)
    expect(result.installedAgents).toEqual([])
  })

  test('detects editors itself when none are passed', async () => {
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor'], skipped: false})

    await configureSkills({output: mockOutput})

    expect(mockDetectAvailableEditors).toHaveBeenCalledTimes(1)
  })

  test('uses provided editors without re-detecting', async () => {
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor'], skipped: false})

    const result = await configureSkills({editors: [editor('Cursor')], output: mockOutput})

    expect(mockDetectAvailableEditors).not.toHaveBeenCalled()
    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['cursor'], output: mockOutput})
    expect(result.detectedEditors).toEqual(['Cursor'])
  })
})
