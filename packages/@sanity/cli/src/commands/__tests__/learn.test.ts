import {runCommand} from '@oclif/test'
import open from 'open'
import {describe, expect, test} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {LearnCommand} from '../learn.js'

describe('#learn', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(LearnCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/learn')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/learn')
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('learn --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Opens Sanity Learn in your web browser

      USAGE
        $ sanity learn

      DESCRIPTION
        Opens Sanity Learn in your web browser

      "
    `)
  })
})
