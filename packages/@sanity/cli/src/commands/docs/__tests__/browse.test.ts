import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {DocsBrowseCommand} from '../browse.js'

describe('#docs:browse', () => {
  test('command runs and opens docs URL', async () => {
    const {stdout} = await testCommand(DocsBrowseCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/docs')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs')
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('docs browse --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Open Sanity docs in a web browser

      USAGE
        $ sanity docs browse

      DESCRIPTION
        Open Sanity docs in a web browser

      "
    `)
  })
})
