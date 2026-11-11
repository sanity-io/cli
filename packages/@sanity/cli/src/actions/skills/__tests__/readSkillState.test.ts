import {type InstalledSkillInfo} from 'skills'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {readSkillState} from '../readSkillState.js'

const mockListSkills = vi.hoisted(() => vi.fn())

vi.mock('skills', () => ({
  listSkills: mockListSkills,
}))

const SKILL = 'sanity-best-practices'
const MIGRATION_SKILL = 'sanity-migration'

function editor(name: Editor['name']): Editor {
  return {configPath: `/fake/${name}/config.json`, configured: false, name}
}

function installed(
  name: string,
  agents: string[],
  path = `/home/u/.cursor/skills/${name}`,
): InstalledSkillInfo {
  return {agents, description: '', name, path, scope: 'global'}
}

function mockInstalledSkills(skills: InstalledSkillInfo[]): void {
  mockListSkills.mockResolvedValue({skills})
}

describe('readSkillState', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists global skills and maps agent IDs to display names', async () => {
    mockInstalledSkills([installed(SKILL, ['cursor', 'claude-code'])])

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(mockListSkills).toHaveBeenCalledWith({
      scope: 'global',
      signal: expect.any(AbortSignal),
    })
    expect([...result.installedAgentDisplayNames]).toEqual(['Cursor', 'Claude Code'])
  })

  test('keeps agent IDs without a known display name as-is', async () => {
    mockInstalledSkills([installed(SKILL, ['some-new-agent'])])

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect([...result.installedAgentDisplayNames]).toEqual(['some-new-agent'])
  })

  test('only returns agents that have every requested skill installed', async () => {
    mockInstalledSkills([
      installed(SKILL, ['cursor', 'claude-code']),
      installed(MIGRATION_SKILL, ['claude-code']),
    ])

    const result = await readSkillState({editors: [], skillNames: [SKILL, MIGRATION_SKILL]})

    expect([...result.installedAgentDisplayNames]).toEqual(['Claude Code'])
  })

  test('credits detected universal editors when skills live in the universal directory', async () => {
    mockInstalledSkills([
      installed(SKILL, ['claude-code'], '/home/u/.agents/skills/sanity-best-practices'),
      installed(MIGRATION_SKILL, ['claude-code'], '/home/u/.agents/skills/sanity-migration'),
    ])

    // Cursor is universal (reads from `.agents/skills`) but is not listed in the
    // `agents` arrays; it should still be credited because the skills live in
    // the shared universal directory. Claude Code is credited via its own entry.
    const result = await readSkillState({
      editors: [editor('Cursor'), editor('Claude Code')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect([...result.installedAgentDisplayNames].toSorted()).toEqual(['Claude Code', 'Cursor'])
  })

  test('credits universal editors for Windows-style (backslash) universal paths', async () => {
    mockInstalledSkills([
      installed(SKILL, ['claude-code'], 'C:\\Users\\u\\.agents\\skills\\sanity-best-practices'),
      installed(
        MIGRATION_SKILL,
        ['claude-code'],
        'C:\\Users\\u\\.agents\\skills\\sanity-migration',
      ),
    ])

    const result = await readSkillState({
      editors: [editor('Cursor'), editor('Claude Code')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect([...result.installedAgentDisplayNames].toSorted()).toEqual(['Claude Code', 'Cursor'])
  })

  test('does not credit universal editors when skills are not in the universal directory', async () => {
    mockInstalledSkills([
      installed(SKILL, ['claude-code'], '/home/u/.claude/skills/sanity-best-practices'),
      installed(MIGRATION_SKILL, ['claude-code'], '/home/u/.claude/skills/sanity-migration'),
    ])

    const result = await readSkillState({
      editors: [editor('Cursor'), editor('Claude Code')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect([...result.installedAgentDisplayNames]).toEqual(['Claude Code'])
  })

  test('does not credit editors without a skills-CLI mapping even when universal', async () => {
    mockInstalledSkills([
      installed(SKILL, [], '/home/u/.agents/skills/sanity-best-practices'),
      installed(MIGRATION_SKILL, [], '/home/u/.agents/skills/sanity-migration'),
    ])

    // Zed has no skills-CLI agent mapping, so it should never be credited.
    const result = await readSkillState({
      editors: [editor('Zed')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when one of the requested skills is missing entirely', async () => {
    mockInstalledSkills([installed(SKILL, ['cursor', 'claude-code'])])

    const result = await readSkillState({editors: [], skillNames: [SKILL, MIGRATION_SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the named skill is not present', async () => {
    mockInstalledSkills([installed('something-else', ['cursor'])])

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the skill has no agents', async () => {
    mockInstalledSkills([installed(SKILL, [])])

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when nothing is installed', async () => {
    mockInstalledSkills([])

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when listing skills fails', async () => {
    mockListSkills.mockRejectedValue(new Error('boom'))

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })
})
