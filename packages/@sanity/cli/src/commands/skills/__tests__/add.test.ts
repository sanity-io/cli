import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {setupSkills} from '../../../actions/skills/setupSkills.js'
import {AddSkillsCommand} from '../add.js'

const mockSetupSkills = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(false))

vi.mock('../../../actions/skills/setupSkills.js', () => ({
  setupSkills: mockSetupSkills,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('skills add', () => {
  test('runs setupSkills in auto mode when non-interactive', async () => {
    mockSetupSkills.mockResolvedValue({
      installedAgents: ['cursor'],
      installedForEditors: ['Cursor'],
      skipped: false,
    })

    const {error} = await testCommand(AddSkillsCommand, [])

    if (error) throw error

    expect(setupSkills).toHaveBeenCalledWith(
      expect.objectContaining({explicit: true, mode: 'auto'}),
    )
  })

  test('runs setupSkills in prompt mode when interactive', async () => {
    mockIsInteractive.mockReturnValueOnce(true)
    mockSetupSkills.mockResolvedValue({
      installedAgents: ['claude-code'],
      installedForEditors: ['Claude Code'],
      skipped: false,
    })

    const {error} = await testCommand(AddSkillsCommand, [])

    if (error) throw error

    expect(setupSkills).toHaveBeenCalledWith(
      expect.objectContaining({explicit: true, mode: 'prompt'}),
    )
  })

  test('passes process.cwd() as cwd', async () => {
    mockSetupSkills.mockResolvedValue({
      installedAgents: [],
      installedForEditors: [],
      skipped: true,
    })

    const {error} = await testCommand(AddSkillsCommand, [])

    if (error) throw error

    expect(setupSkills).toHaveBeenCalledWith(expect.objectContaining({cwd: process.cwd()}))
  })

  test('does not throw when setupSkills returns an error result', async () => {
    mockSetupSkills.mockResolvedValue({
      error: new Error('install failed'),
      installedAgents: [],
      installedForEditors: [],
      skipped: false,
    })

    const {error} = await testCommand(AddSkillsCommand, [])

    expect(error).toBeUndefined()
  })

  test('surfaces unexpected errors via this.error', async () => {
    mockSetupSkills.mockRejectedValue(new Error('boom'))

    const {error} = await testCommand(AddSkillsCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('boom')
  })
})
