import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {readSkillState} from '../readSkillState.js'
import {SKILLS_BIN_PATH} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

const SKILL = 'sanity-best-practices'
const MIGRATION_SKILL = 'sanity-migration'

function editor(name: Editor['name']): Editor {
  return {configPath: `/fake/${name}/config.json`, configured: false, name}
}

describe('readSkillState', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns the agents reported by `skills list -g --json`', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {
          agents: ['Cursor', 'Claude Code'],
          name: SKILL,
          path: '/home/u/.cursor/skills/sanity-best-practices',
          scope: 'global',
        },
      ]),
    })

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [SKILLS_BIN_PATH, 'list', '-g', '--json'],
      expect.objectContaining({stdio: 'pipe', timeout: 10_000}),
    )
    expect([...result.installedAgentDisplayNames]).toEqual(['Cursor', 'Claude Code'])
  })

  test('only returns agents that have every requested skill installed', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {agents: ['Cursor', 'Claude Code'], name: SKILL},
        {agents: ['Claude Code'], name: MIGRATION_SKILL},
      ]),
    })

    const result = await readSkillState({editors: [], skillNames: [SKILL, MIGRATION_SKILL]})

    expect([...result.installedAgentDisplayNames]).toEqual(['Claude Code'])
  })

  test('credits detected universal editors when skills live in the universal directory', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {
          agents: ['Claude Code'],
          name: SKILL,
          path: '/home/u/.agents/skills/sanity-best-practices',
        },
        {
          agents: ['Claude Code'],
          name: MIGRATION_SKILL,
          path: '/home/u/.agents/skills/sanity-migration',
        },
      ]),
    })

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
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {
          agents: ['Claude Code'],
          name: SKILL,
          path: 'C:\\Users\\u\\.agents\\skills\\sanity-best-practices',
        },
        {
          agents: ['Claude Code'],
          name: MIGRATION_SKILL,
          path: 'C:\\Users\\u\\.agents\\skills\\sanity-migration',
        },
      ]),
    })

    const result = await readSkillState({
      editors: [editor('Cursor'), editor('Claude Code')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect([...result.installedAgentDisplayNames].toSorted()).toEqual(['Claude Code', 'Cursor'])
  })

  test('does not credit universal editors when skills are not in the universal directory', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {
          agents: ['Claude Code'],
          name: SKILL,
          path: '/home/u/.claude/skills/sanity-best-practices',
        },
        {
          agents: ['Claude Code'],
          name: MIGRATION_SKILL,
          path: '/home/u/.claude/skills/sanity-migration',
        },
      ]),
    })

    const result = await readSkillState({
      editors: [editor('Cursor'), editor('Claude Code')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect([...result.installedAgentDisplayNames]).toEqual(['Claude Code'])
  })

  test('does not credit editors without a skills-CLI mapping even when universal', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([
        {agents: [], name: SKILL, path: '/home/u/.agents/skills/sanity-best-practices'},
        {agents: [], name: MIGRATION_SKILL, path: '/home/u/.agents/skills/sanity-migration'},
      ]),
    })

    // Zed has no skills-CLI agent mapping, so it should never be credited.
    const result = await readSkillState({
      editors: [editor('Zed')],
      skillNames: [SKILL, MIGRATION_SKILL],
    })

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when one of the requested skills is missing entirely', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([{agents: ['Cursor', 'Claude Code'], name: SKILL}]),
    })

    const result = await readSkillState({editors: [], skillNames: [SKILL, MIGRATION_SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the named skill is not present', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([{agents: ['Cursor'], name: 'something-else'}]),
    })

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the skill entry has no agents array', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify([{name: SKILL}])})

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the list is empty', async () => {
    mockExeca.mockResolvedValue({stdout: '[]'})

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when JSON is malformed', async () => {
    mockExeca.mockResolvedValue({stdout: '{not json'})

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the JSON root is not an array', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({wrong: 'shape'})})

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the subprocess fails', async () => {
    mockExeca.mockRejectedValue(new Error('boom'))

    const result = await readSkillState({editors: [], skillNames: [SKILL]})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })
})
