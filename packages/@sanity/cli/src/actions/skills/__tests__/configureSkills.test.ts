import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {configureSkills} from '../configureSkills.js'

const mockDetectAvailableEditors = vi.hoisted(() => vi.fn())
const mockReadSkillState = vi.hoisted(() => vi.fn())
const mockSetupSkills = vi.hoisted(() => vi.fn())
const mockCheckbox = vi.hoisted(() => vi.fn())

vi.mock('../../mcp/detectAvailableEditors.js', () => ({
  detectAvailableEditors: mockDetectAvailableEditors,
}))

vi.mock('../readSkillState.js', () => ({
  readSkillState: mockReadSkillState,
}))

vi.mock('../setupSkills.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../setupSkills.js')>()
  return {
    ...actual,
    setupSkills: mockSetupSkills,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    checkbox: mockCheckbox,
  }
})

function editor(name: Editor['name']): Editor {
  return {configPath: `/fake/${name}/config.json`, configured: false, name}
}

function defaultMocks(): void {
  mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})
  mockSetupSkills.mockResolvedValue({installedAgents: [], skipped: false})
}

describe('configureSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('auto mode installs skills for every candidate without prompting', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor'), editor('Codex CLI')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor', 'codex'], skipped: false})

    const result = await configureSkills({mode: 'auto'})

    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['cursor', 'codex']})
    expect(result.installedAgents).toEqual(['cursor', 'codex'])
    expect(result.detectedEditors).toEqual(['Cursor', 'Codex CLI'])
    expect(result.skipped).toBe(false)
  })

  test('prompt mode installs only the selected editors', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor'), editor('Codex CLI')])
    mockCheckbox.mockResolvedValue(['Cursor'])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor'], skipped: false})

    const result = await configureSkills({mode: 'prompt'})

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {checked: true, name: 'Cursor', value: 'Cursor'},
        {checked: true, name: 'Codex CLI', value: 'Codex CLI'},
      ],
      message: 'Install Sanity agent skills for these editors?',
    })
    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['cursor']})
    expect(result.installedAgents).toEqual(['cursor'])
  })

  test('dedupes agents shared across multiple editors', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('VS Code'), editor('GitHub Copilot CLI')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['github-copilot'], skipped: false})

    await configureSkills({mode: 'auto'})

    expect(mockSetupSkills).toHaveBeenCalledWith({agents: ['github-copilot']})
  })

  test('skips install when skills are already installed for all candidates', async () => {
    defaultMocks()
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])

    const result = await configureSkills({mode: 'auto'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.installedAgents).toEqual([])
  })

  test('skips when no detected editor supports skills', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Zed')])

    const result = await configureSkills({mode: 'auto'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
    expect(result.detectedEditors).toEqual(['Zed'])
  })

  test('prompt mode skips when the user deselects everything', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    mockCheckbox.mockResolvedValue([])

    const result = await configureSkills({mode: 'prompt'})

    expect(mockSetupSkills).not.toHaveBeenCalled()
    expect(result.skipped).toBe(true)
  })

  test('surfaces install errors without throwing', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    const installErr = new Error('skills exited 1')
    mockSetupSkills.mockResolvedValue({error: installErr, installedAgents: [], skipped: false})

    const result = await configureSkills({mode: 'auto'})

    expect(result.error).toBe(installErr)
    expect(result.installedAgents).toEqual([])
  })

  test('detects editors itself when none are passed', async () => {
    defaultMocks()
    mockDetectAvailableEditors.mockResolvedValue([editor('Cursor')])
    mockSetupSkills.mockResolvedValue({installedAgents: ['cursor'], skipped: false})

    await configureSkills({mode: 'auto'})

    expect(mockDetectAvailableEditors).toHaveBeenCalledTimes(1)
  })
})
