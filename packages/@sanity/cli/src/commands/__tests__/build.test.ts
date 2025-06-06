import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {BuildCommand} from '../build.js'

describe('#build', () => {
  test('help text is correct', async () => {
    const {stdout} = await runCommand('build --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Builds the Sanity Studio configuration into a static bundle

      USAGE
        $ sanity build [OUTPUTDIR] [--auto-updates] [--minify]
          [--source-maps] [-y]

      ARGUMENTS
        OUTPUTDIR  Output directory

      FLAGS
        -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt
                                 and otherwise uses defaults
            --[no-]auto-updates  Enable/disable auto updates of studio versions
            --[no-]minify        Enable/disable minifying of built bundles
            --[no-]source-maps   Enable source maps for built bundles (increases size
                                 of bundle)

      DESCRIPTION
        Builds the Sanity Studio configuration into a static bundle

      EXAMPLES
        $ sanity build

        $ sanity build --no-minify --source-maps

      "
    `)
  })
  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(BuildCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })
})
