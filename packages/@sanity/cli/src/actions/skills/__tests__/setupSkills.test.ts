import {ux} from '@oclif/core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  SANITY_SKILL_NAMES,
  SANITY_SKILLS_REPO,
  setupSkills,
  SKILLS_BIN_PATH,
} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

const mockOutput = {
  error: vi.fn() as never,
  log: vi.fn(),
  warn: vi.fn(),
}

describe('setupSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns skipped when no agents are passed', async () => {
    const result = await setupSkills({agents: [], output: mockOutput})

    expect(result).toEqual({installedAgents: [], skipped: true})
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('installs globally for a single agent', async () => {
    mockExeca.mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [
        SKILLS_BIN_PATH,
        'add',
        SANITY_SKILLS_REPO,
        '--skill',
        ...SANITY_SKILL_NAMES,
        '-g',
        '-a',
        'cursor',
        '-y',
      ],
      expect.objectContaining({stdio: 'pipe', timeout: 90_000}),
    )
    expect(result).toEqual({installedAgents: ['cursor'], skipped: false})
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Installed Sanity agent skills for cursor'),
    )
  })

  test('deduplicates repeated agent IDs', async () => {
    mockExeca.mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})

    const result = await setupSkills({agents: ['cline', 'cline', 'cursor'], output: mockOutput})

    expect(result.installedAgents).toEqual(['cline', 'cursor'])
    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [
        SKILLS_BIN_PATH,
        'add',
        SANITY_SKILLS_REPO,
        '--skill',
        ...SANITY_SKILL_NAMES,
        '-g',
        '-a',
        'cline',
        '-a',
        'cursor',
        '-y',
      ],
      expect.any(Object),
    )
  })

  test('passes every agent as a separate -a flag', async () => {
    mockExeca.mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})

    await setupSkills({agents: ['cursor', 'claude-code', 'github-copilot'], output: mockOutput})

    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [
        SKILLS_BIN_PATH,
        'add',
        SANITY_SKILLS_REPO,
        '--skill',
        ...SANITY_SKILL_NAMES,
        '-g',
        '-a',
        'cursor',
        '-a',
        'claude-code',
        '-a',
        'github-copilot',
        '-y',
      ],
      expect.any(Object),
    )
  })

  test('prints a summary grouping universal agents and listing additional ones', async () => {
    mockExeca.mockResolvedValue({exitCode: 0, stderr: '', stdout: ''})
    const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

    await setupSkills({agents: ['cursor', 'github-copilot', 'claude-code']})

    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('\n')
    // Universal agents are grouped under a single shared-directory header.
    expect(output).toContain('Universal (~/.agents/skills)')
    expect(output).toContain('Cursor, GitHub Copilot')
    // Non-universal agents (Claude Code) are listed separately with their dir.
    expect(output).toContain('Additional agents')
    expect(output).toContain('Claude Code (~/.claude/skills)')

    stdoutSpy.mockRestore()
  })

  test('returns an error result when the skills CLI fails (does not throw)', async () => {
    const installErr = new Error('skills exited 1')
    mockExeca.mockRejectedValue(installErr)

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(result.skipped).toBe(false)
    expect(result.installedAgents).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('skills exited 1')
    expect(mockOutput.warn).toHaveBeenCalledWith(
      'Could not install Sanity agent skills: skills exited 1',
    )
  })

  test('installs both the best-practices and migration skills', () => {
    expect(SANITY_SKILL_NAMES).toEqual(['sanity-best-practices', 'sanity-migration'])
  })

  test('resolves SKILLS_BIN_PATH to a path that points at the bundled cli', () => {
    // Accept both POSIX and Windows path separators
    expect(SKILLS_BIN_PATH).toMatch(/skills[\\/]bin[\\/]cli\.mjs$/)
  })
})
