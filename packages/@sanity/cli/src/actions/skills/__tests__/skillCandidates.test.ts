import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {SANITY_SKILL_NAMES} from '../setupSkills.js'
import {getInstalledSkillAgentDisplayNames, getSkillCandidates} from '../skillCandidates.js'

const mockReadSkillState = vi.hoisted(() => vi.fn())

vi.mock('../readSkillState.js', () => ({
  readSkillState: mockReadSkillState,
}))

function editor(name: Editor['name']): Editor {
  return {configPath: `/fake/${name}/config.json`, configured: false, name}
}

describe('getSkillCandidates', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns editors with a skills mapping that are not yet installed', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})

    const candidates = await getSkillCandidates([editor('Cursor')])

    expect(candidates).toEqual([{agent: 'cursor', editor: editor('Cursor')}])
  })

  test('skips editors without a skills-CLI mapping (Zed, MCPorter)', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})

    const candidates = await getSkillCandidates([editor('Zed'), editor('MCPorter')])

    expect(candidates).toEqual([])
  })

  test('skips editors whose skills are already installed (by agent display name)', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})

    const candidates = await getSkillCandidates([editor('Cursor')])

    expect(candidates).toEqual([])
  })

  test('keeps one candidate entry per editor even when agents collide', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set()})

    // VS Code and GitHub Copilot CLI both map to the `github-copilot` agent.
    const candidates = await getSkillCandidates([editor('VS Code'), editor('GitHub Copilot CLI')])

    expect(candidates.map((c) => c.agent)).toEqual(['github-copilot', 'github-copilot'])
    expect(candidates.map((c) => c.editor.name)).toEqual(['VS Code', 'GitHub Copilot CLI'])
  })

  test('excludes both editors sharing an agent once that agent is installed', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['GitHub Copilot'])})

    const candidates = await getSkillCandidates([editor('VS Code'), editor('GitHub Copilot CLI')])

    expect(candidates).toEqual([])
  })
})

describe('getInstalledSkillAgentDisplayNames', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('probes readSkillState with the Sanity skill names and editors, returning the set', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})
    const editors = [editor('Cursor')]

    const result = await getInstalledSkillAgentDisplayNames(editors)

    expect(mockReadSkillState).toHaveBeenCalledWith({editors, skillNames: SANITY_SKILL_NAMES})
    expect(result).toEqual(new Set(['Cursor']))
  })
})
