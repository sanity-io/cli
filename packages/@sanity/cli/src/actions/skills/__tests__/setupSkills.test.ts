import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../../mcp/types.js'
import {SANITY_SKILLS_REPO, setupSkills} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

function editor(name: Editor['name']): Editor {
  return {configPath: `/tmp/${name}.json`, configured: false, name}
}

describe('setupSkills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('mode: skip returns early without calling npx', async () => {
    const result = await setupSkills({editors: [editor('Cursor')], mode: 'skip'})

    expect(result).toEqual({installedAgents: [], skipped: true})
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('skips when no editors have a skills agent mapping', async () => {
    // Zed and MCPorter do not have a skillsCliAgent mapping
    const result = await setupSkills({editors: [editor('Zed'), editor('MCPorter')]})

    expect(result).toEqual({installedAgents: [], skipped: true})
    expect(mockExeca).not.toHaveBeenCalled()
  })

  test('installs skills for mapped agents via npx', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    const result = await setupSkills({
      editors: [editor('Cursor'), editor('Claude Code')],
    })

    expect(mockExeca).toHaveBeenCalledTimes(1)
    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'cursor', '-a', 'claude-code', '-y'],
      expect.objectContaining({stdio: 'inherit'}),
    )
    expect(result.installedAgents).toEqual(['cursor', 'claude-code'])
    expect(result.skipped).toBe(false)
    expect(result.error).toBeUndefined()
  })

  test('deduplicates agents (e.g. Cline and Cline CLI map to the same agent)', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    const result = await setupSkills({
      editors: [editor('Cline'), editor('Cline CLI')],
    })

    expect(result.installedAgents).toEqual(['cline'])
    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'cline', '-y'],
      expect.any(Object),
    )
  })

  test('filters out editors that have no skills agent before invoking npx', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    const result = await setupSkills({
      editors: [editor('Zed'), editor('Cursor'), editor('MCPorter')],
    })

    expect(result.installedAgents).toEqual(['cursor'])
    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'cursor', '-y'],
      expect.any(Object),
    )
  })

  test('returns an error result when npx fails (does not throw)', async () => {
    const installErr = new Error('npx exited 1')
    mockExeca.mockRejectedValue(installErr)

    const result = await setupSkills({editors: [editor('Cursor')]})

    expect(result.skipped).toBe(false)
    expect(result.installedAgents).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('npx exited 1')
  })

  test('VS Code maps to github-copilot agent', async () => {
    mockExeca.mockResolvedValue({exitCode: 0})

    await setupSkills({editors: [editor('VS Code'), editor('VS Code Insiders')]})

    expect(mockExeca).toHaveBeenCalledWith(
      'npx',
      ['-y', 'skills', 'add', SANITY_SKILLS_REPO, '-a', 'github-copilot', '-y'],
      expect.any(Object),
    )
  })
})
