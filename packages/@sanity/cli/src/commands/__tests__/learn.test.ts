import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {LearnCommand} from '../learn.js'

describe('#learn', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(LearnCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/learn')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/learn')
  })
})
