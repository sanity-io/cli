import {describe, expect, test} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {BuildCommand} from '../build.js'

describe('#build', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(BuildCommand)

    expect(stdout).toContain(
      JSON.stringify({
        minify: true,
        'source-maps': false,
        yes: false,
      }),
    )
  })

  test('takes minify flag', async () => {
    const {stdout} = await testCommand(BuildCommand, ['--no-minify'])

    expect(stdout).toContain(
      JSON.stringify({
        minify: false,
        'source-maps': false,
        yes: false,
      }),
    )
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(BuildCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })
})
