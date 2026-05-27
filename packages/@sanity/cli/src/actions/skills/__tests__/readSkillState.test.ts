import {afterEach, describe, expect, test, vi} from 'vitest'

import {readSkillState} from '../readSkillState.js'
import {SKILLS_BIN_PATH} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

const SKILL = 'sanity-best-practices'

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

    const result = await readSkillState({skillName: SKILL})

    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [SKILLS_BIN_PATH, 'list', '-g', '--json'],
      expect.objectContaining({stdio: 'pipe', timeout: 10_000}),
    )
    expect([...result.installedAgentDisplayNames]).toEqual(['Cursor', 'Claude Code'])
  })

  test('returns an empty Set when the named skill is not present', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify([{agents: ['Cursor'], name: 'something-else'}]),
    })

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the skill entry has no agents array', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify([{name: SKILL}])})

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the list is empty', async () => {
    mockExeca.mockResolvedValue({stdout: '[]'})

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when JSON is malformed', async () => {
    mockExeca.mockResolvedValue({stdout: '{not json'})

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the JSON root is not an array', async () => {
    mockExeca.mockResolvedValue({stdout: JSON.stringify({wrong: 'shape'})})

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })

  test('returns an empty Set when the subprocess fails', async () => {
    mockExeca.mockRejectedValue(new Error('boom'))

    const result = await readSkillState({skillName: SKILL})

    expect(result.installedAgentDisplayNames.size).toBe(0)
  })
})
