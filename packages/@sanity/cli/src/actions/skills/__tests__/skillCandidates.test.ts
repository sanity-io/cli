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
  test('returns editors with a skills mapping that are not yet installed', () => {
    const candidates = getSkillCandidates([editor('Cursor')], new Set())

    expect(candidates).toEqual([{agent: 'cursor', editor: editor('Cursor')}])
  })

  test('skips editors without a skills-CLI mapping (Zed, MCPorter)', () => {
    const candidates = getSkillCandidates([editor('Zed'), editor('MCPorter')], new Set())

    expect(candidates).toEqual([])
  })

  test('skips editors whose skills are already installed (by agent display name)', () => {
    const candidates = getSkillCandidates([editor('Cursor')], new Set(['Cursor']))

    expect(candidates).toEqual([])
  })

  test('keeps one candidate entry per editor even when agents collide', () => {
    // VS Code and GitHub Copilot CLI both map to the `github-copilot` agent.
    const candidates = getSkillCandidates(
      [editor('VS Code'), editor('GitHub Copilot CLI')],
      new Set(),
    )

    expect(candidates.map((c) => c.agent)).toEqual(['github-copilot', 'github-copilot'])
    expect(candidates.map((c) => c.editor.name)).toEqual(['VS Code', 'GitHub Copilot CLI'])
  })

  test('excludes both editors sharing an agent once that agent is installed', () => {
    const candidates = getSkillCandidates(
      [editor('VS Code'), editor('GitHub Copilot CLI')],
      new Set(['GitHub Copilot']),
    )

    expect(candidates).toEqual([])
  })
})

describe('getInstalledSkillAgentDisplayNames', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('probes readSkillState with the Sanity skill names and returns the set', async () => {
    mockReadSkillState.mockResolvedValue({installedAgentDisplayNames: new Set(['Cursor'])})

    const result = await getInstalledSkillAgentDisplayNames()

    expect(mockReadSkillState).toHaveBeenCalledWith({skillNames: SANITY_SKILL_NAMES})
    expect(result).toEqual(new Set(['Cursor']))
  })
})
