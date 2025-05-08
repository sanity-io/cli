import {runCommand} from '@oclif/test'
import open from 'open'
import {describe, expect, test} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import DocsCommand from '../docs.js'

describe('#docs', () => {
  test('command runs', async () => {
    await testCommand(DocsCommand)

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
