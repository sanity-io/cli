import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {runSkillsUpdate} from '../../../actions/skills/runSkillsUpdate.js'
import {UpdateSkillsCommand} from '../update.js'

const mockRunSkillsUpdate = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/skills/runSkillsUpdate.js', () => ({
  runSkillsUpdate: mockRunSkillsUpdate,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('skills update', () => {
  test('invokes runSkillsUpdate with process.cwd()', async () => {
    mockRunSkillsUpdate.mockResolvedValue({
      noOp: false,
      stdout: '',
      succeeded: true,
      updatedSkills: ['sanity-best-practices'],
    })

    const {error} = await testCommand(UpdateSkillsCommand, [])

    if (error) throw error

    expect(runSkillsUpdate).toHaveBeenCalledWith({cwd: process.cwd()})
  })

  test('does not throw when runSkillsUpdate returns an error result', async () => {
    mockRunSkillsUpdate.mockResolvedValue({
      error: new Error('skills exited 1'),
      noOp: false,
      stdout: '',
      succeeded: false,
      updatedSkills: [],
    })

    const {error} = await testCommand(UpdateSkillsCommand, [])

    expect(error).toBeUndefined()
  })

  test('surfaces unexpected errors via this.error', async () => {
    mockRunSkillsUpdate.mockRejectedValue(new Error('boom'))

    const {error} = await testCommand(UpdateSkillsCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('boom')
  })
})
