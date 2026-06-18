import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {InstallSkillsCommand} from '../install.js'

const mockConfigureSkills = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/skills/configureSkills.js', () => ({
  configureSkills: mockConfigureSkills,
}))

describe('#skills:install', () => {
  beforeEach(() => {
    mockConfigureSkills.mockResolvedValue({
      detectedEditors: ['Cursor'],
      installedAgents: ['cursor'],
      skipped: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('installs Sanity agent skills for all detected editors', async () => {
    const {error} = await testCommand(InstallSkillsCommand, [])

    if (error) throw error

    expect(mockConfigureSkills).toHaveBeenCalledWith({output: expect.anything()})
  })

  test('does not fail the command when configureSkills reports an install error', async () => {
    mockConfigureSkills.mockResolvedValue({
      detectedEditors: ['Cursor'],
      error: new Error('skills exited 1'),
      installedAgents: [],
      skipped: false,
    })

    const {error} = await testCommand(InstallSkillsCommand, [])

    expect(error).toBeUndefined()
  })

  test('exits with code 1 when configureSkills throws', async () => {
    mockConfigureSkills.mockRejectedValue(new Error('unexpected failure'))

    const {error} = await testCommand(InstallSkillsCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('unexpected failure')
    expect(error?.oclif?.exit).toBe(1)
  })
})
