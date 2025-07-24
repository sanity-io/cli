import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {DocsCommand} from '../docs.js'

describe('#docs', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(DocsCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/docs')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs')
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('docs --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Opens Sanity Studio documentation in your web browser

      USAGE
        $ sanity docs

      DESCRIPTION
        Opens Sanity Studio documentation in your web browser

      "
    `)
  })
})
