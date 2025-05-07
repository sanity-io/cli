import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'

describe('#docs', () => {
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
