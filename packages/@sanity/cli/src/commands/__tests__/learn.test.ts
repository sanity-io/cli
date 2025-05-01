import {runCommand} from '@oclif/test'
import {expect, test} from 'vitest'

test('learn', async () => {
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
