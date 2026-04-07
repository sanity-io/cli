import {describe, expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

describe('sanity --help', () => {
  test('prints usage information and exits 0', async () => {
    const {error, stdout} = await runCli({args: ['--help']})

    if (error) throw error
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('COMMANDS')
  })
})
