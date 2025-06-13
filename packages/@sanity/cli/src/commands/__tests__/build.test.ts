import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {runCommand} from '@oclif/test'
import {describe, expect, test} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {BuildCommand} from '../build.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '../../../../../../')
const examplesDir = resolve(rootDir, 'examples')

describe('#build', () => {
  test('help text is correct', async () => {
    const {stdout} = await runCommand('build --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Builds the Sanity Studio configuration into a static bundle

      USAGE
        $ sanity build [OUTPUTDIR] [--auto-updates] [--minify]
          [--source-maps] [--stats] [-y]

      ARGUMENTS
        OUTPUTDIR  Output directory

      FLAGS
        -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt
                                 and otherwise uses defaults
            --[no-]auto-updates  Enable/disable auto updates of studio versions
            --[no-]minify        Enable/disable minifying of built bundles
            --[no-]source-maps   Enable source maps for built bundles (increases size
                                 of bundle)
            --stats              Show stats about the built bundles

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

  test('should build the "basic-studio" example', async () => {
    const cwd = join(examplesDir, 'basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const {error, stderr, stdout} = await testCommand(BuildCommand, [], {
      config: {root: cwd},
    })

    // Assert things here
    expect(error).toBeUndefined()
    expect(stdout).toContain(`Building with auto-updates enabled`)
    expect(stderr).toContain('✔ Clean output folder')
    expect(stderr).toContain(`✔ Build Sanity Studio`)
  })
})
