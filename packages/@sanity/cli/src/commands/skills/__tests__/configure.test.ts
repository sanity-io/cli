import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ConfigureSkillsCommand} from '../configure.js'

const mockConfigureSkills = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(true))

vi.mock('../../../actions/skills/configureSkills.js', () => ({
  configureSkills: mockConfigureSkills,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})

describe('#skills:configure', () => {
  beforeEach(() => {
    mockConfigureSkills.mockResolvedValue({
      detectedEditors: ['Cursor'],
      installedAgents: ['cursor'],
      skipped: false,
    })
    mockIsInteractive.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('runs skills configuration in prompt mode when interactive', async () => {
    const {error} = await testCommand(ConfigureSkillsCommand, [])

    if (error) throw error

    expect(mockConfigureSkills).toHaveBeenCalledWith({mode: 'prompt'})
  })

  test('runs in auto mode when non-interactive', async () => {
    mockIsInteractive.mockReturnValue(false)

    const {error} = await testCommand(ConfigureSkillsCommand, [])

    if (error) throw error

    expect(mockConfigureSkills).toHaveBeenCalledWith({mode: 'auto'})
  })

  test('does not fail the command when configureSkills reports an install error', async () => {
    mockConfigureSkills.mockResolvedValue({
      detectedEditors: ['Cursor'],
      error: new Error('skills exited 1'),
      installedAgents: [],
      skipped: false,
    })

    const {error} = await testCommand(ConfigureSkillsCommand, [])

    expect(error).toBeUndefined()
  })

  test('exits with code 1 when configureSkills throws', async () => {
    mockConfigureSkills.mockRejectedValue(new Error('unexpected failure'))

    const {error} = await testCommand(ConfigureSkillsCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('unexpected failure')
    expect(error?.oclif?.exit).toBe(1)
  })
})
