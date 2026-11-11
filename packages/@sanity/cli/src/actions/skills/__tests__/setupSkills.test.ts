import {afterEach, describe, expect, test, vi} from 'vitest'

import {SANITY_SKILL_NAMES, SANITY_SKILLS_REPO, setupSkills} from '../setupSkills.js'

const mockInstallSkills = vi.hoisted(() => vi.fn())

vi.mock('skills', () => ({
  installSkills: mockInstallSkills,
}))

const mockOutput = {
  error: vi.fn() as never,
  log: vi.fn(),
  logDiagnostic: vi.fn(),
  logJson: vi.fn(),
  warn: vi.fn(),
}

function installResult(failed: {agent: string; message: string; skill: string}[] = []) {
  return {
    failed: failed.map((failure) => ({...failure, code: 'SKILLS_INSTALL_FAILED'})),
    installed: [],
    skipped: [],
    source: {input: SANITY_SKILLS_REPO, type: 'github', url: ''},
  }
}

describe('setupSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns skipped when no agents are passed', async () => {
    const result = await setupSkills({agents: [], output: mockOutput})

    expect(result).toEqual({installedAgents: [], skipped: true})
    expect(mockInstallSkills).not.toHaveBeenCalled()
  })

  test('installs globally for a single agent', async () => {
    mockInstallSkills.mockResolvedValue(installResult())

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(mockInstallSkills).toHaveBeenCalledWith(SANITY_SKILLS_REPO, {
      agents: ['cursor'],
      onWarning: expect.any(Function),
      scope: 'global',
      signal: expect.any(AbortSignal),
      skills: SANITY_SKILL_NAMES,
    })
    expect(result).toEqual({installedAgents: ['cursor'], skipped: false})
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Sanity agent skills installed: [sanity-best-practices, sanity-migration]',
      ),
    )
    expect(mockOutput.warn).not.toHaveBeenCalled()
  })

  test('deduplicates repeated agent IDs', async () => {
    mockInstallSkills.mockResolvedValue(installResult())

    const result = await setupSkills({agents: ['cline', 'cline', 'cursor'], output: mockOutput})

    expect(result.installedAgents).toEqual(['cline', 'cursor'])
    expect(mockInstallSkills).toHaveBeenCalledWith(
      SANITY_SKILLS_REPO,
      expect.objectContaining({agents: ['cline', 'cursor']}),
    )
  })

  test('passes every agent to the install', async () => {
    mockInstallSkills.mockResolvedValue(installResult())

    await setupSkills({agents: ['cursor', 'claude-code', 'github-copilot'], output: mockOutput})

    expect(mockInstallSkills).toHaveBeenCalledWith(
      SANITY_SKILLS_REPO,
      expect.objectContaining({agents: ['cursor', 'claude-code', 'github-copilot']}),
    )
  })

  test('prints a summary grouping universal agents and listing additional ones', async () => {
    mockInstallSkills.mockResolvedValue(installResult())

    await setupSkills({agents: ['cursor', 'github-copilot', 'claude-code'], output: mockOutput})

    const logged = mockOutput.log.mock.calls.map((call) => String(call[0])).join('\n')
    // Universal agents are grouped under a single shared-directory header.
    expect(logged).toContain('Universal (~/.agents/skills)')
    expect(logged).toContain('Cursor, GitHub Copilot')
    // Non-universal agents (Claude Code) are listed separately with their dir.
    expect(logged).toContain('Additional agents')
    expect(logged).toContain('Claude Code (~/.claude/skills)')
  })

  test('debug-logs non-fatal warnings without surfacing them', async () => {
    mockInstallSkills.mockImplementation(async (_source, options) => {
      options.onWarning(new Error('skipped invalid SKILL.md'))
      return installResult()
    })

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(result).toEqual({installedAgents: ['cursor'], skipped: false})
    expect(mockOutput.warn).not.toHaveBeenCalled()
  })

  test('returns an error result when the install throws (does not throw)', async () => {
    mockInstallSkills.mockRejectedValue(new Error('Failed to clone sanity-io/agent-toolkit'))

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(result.skipped).toBe(false)
    expect(result.installedAgents).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('Failed to clone sanity-io/agent-toolkit')
    expect(mockOutput.warn).toHaveBeenCalledTimes(1)
    expect(mockOutput.warn).toHaveBeenCalledWith(
      'Could not install Sanity agent skills: Failed to clone sanity-io/agent-toolkit',
    )
    expect(mockOutput.log).not.toHaveBeenCalled()
  })

  test('surfaces the fix hint of a thrown diagnostic', async () => {
    mockInstallSkills.mockRejectedValue(
      Object.assign(new Error('Access denied'), {fix: 'Check your git credentials'}),
    )

    await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(mockOutput.warn).toHaveBeenCalledWith(
      'Could not install Sanity agent skills: Access denied',
    )
    expect(mockOutput.warn).toHaveBeenCalledWith('Check your git credentials')
  })

  test('returns an error result when every agent fails', async () => {
    mockInstallSkills.mockResolvedValue(
      installResult([
        {agent: 'cursor', message: 'disk full', skill: 'sanity-best-practices'},
        {agent: 'cursor', message: 'disk full', skill: 'sanity-migration'},
      ]),
    )

    const result = await setupSkills({agents: ['cursor'], output: mockOutput})

    expect(result.installedAgents).toEqual([])
    expect(result.skipped).toBe(false)
    expect(result.error?.message).toBe('disk full\ndisk full')
    expect(mockOutput.warn).toHaveBeenCalledWith('Could not install Sanity agent skills:')
    expect(mockOutput.warn).toHaveBeenCalledWith('disk full')
    expect(mockOutput.log).not.toHaveBeenCalled()
  })

  test('reports partial success when only some agents fail', async () => {
    mockInstallSkills.mockResolvedValue(
      installResult([
        {agent: 'claude-code', message: 'permission denied', skill: 'sanity-migration'},
      ]),
    )

    const result = await setupSkills({agents: ['cursor', 'claude-code'], output: mockOutput})

    expect(result.installedAgents).toEqual(['cursor'])
    expect(result.error?.message).toBe('permission denied')
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Sanity agent skills installed'),
    )
    expect(mockOutput.warn).toHaveBeenCalledWith(
      'Could not install Sanity agent skills for some agents:',
    )
    expect(mockOutput.warn).toHaveBeenCalledWith('permission denied')
  })

  test('installs both the best-practices and migration skills', () => {
    expect(SANITY_SKILL_NAMES).toEqual(['sanity-best-practices', 'sanity-migration'])
  })
})
