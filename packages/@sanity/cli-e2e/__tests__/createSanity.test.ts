import {describe, expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

const createSanityBinary = process.env.E2E_CREATE_SANITY_BINARY_PATH

describe.skipIf(!createSanityBinary)('create-sanity', () => {
  test('--help prints usage and exits 0', async () => {
    const {error, stdout} = await runCli({
      args: ['--help'],
      binaryPath: createSanityBinary!,
    })

    if (error) throw error
    expect(stdout).toContain('Initialize a new Sanity Studio')
  })
})
