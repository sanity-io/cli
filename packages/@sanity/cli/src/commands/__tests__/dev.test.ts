import {testCommand} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {DevCommand} from '../dev.js'

describe('#dev', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(DevCommand)

    expect(stdout).toContain(
      JSON.stringify({
        host: '127.0.0.1',
        port: 3333,
      }),
    )
  })

  test('takes port and host flags', async () => {
    const {stdout} = await testCommand(DevCommand, ['--host', '0.0.0.0', '--port', '3000'])

    expect(stdout).toContain(
      JSON.stringify({
        host: '0.0.0.0',
        port: 3000,
      }),
    )
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DevCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })
})
