import {readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'
import {testExample} from '~test/helpers/testExample.js'

import {BuildCommand} from '../build.js'

describe(
  '#build',
  // might help with speed of tests if not ran concurrently
  {concurrent: false},
  () => {
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
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes'], {
        config: {root: cwd},
      })

      // Assert things here
      expect(error).toBeUndefined()
      expect(stdout).toContain(`Building with auto-updates enabled`)
      expect(stderr).toContain('✔ Clean output folder')
      expect(stderr).toContain(`✔ Build Sanity Studio`)

      const outputFolder = join(cwd, 'dist')
      const files = await readdir(outputFolder)
      expect(files).toContain('index.html')
      expect(files).toContain('static')
    })

    test('should build the "basic-app" example', async () => {
      const cwd = await testExample('basic-app')
      process.chdir(cwd)

      const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Clean output folder')
      expect(stderr).toContain(`Build Sanity application`)

      const outputFolder = join(cwd, 'dist')
      const files = await readdir(outputFolder)
      expect(files).toContain('index.html')
      expect(files).toContain('static')
    })

    test('should build the "basic-app" example with auto-updates', async () => {
      const cwd = await testExample('basic-app')
      process.chdir(cwd)

      const {error, stderr, stdout} = await testCommand(BuildCommand, ['--auto-updates', '--yes'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain(`Building with auto-updates enabled`)
      expect(stderr).toContain('Clean output folder')
      expect(stderr).toContain(`Build Sanity application`)

      const outputFolder = join(cwd, 'dist')
      const files = await readdir(outputFolder)
      expect(files).toContain('index.html')
      expect(files).toContain('static')

      const indexHtml = await readFile(join(outputFolder, 'index.html'), 'utf8')
      expect(indexHtml).toContain('importmap')
    })

    // worst-case-studio example takes a long time to build
    test("should build the 'worst-case-studio' example", {timeout: 12_000}, async () => {
      const cwd = await testExample('worst-case-studio')
      process.chdir(cwd)

      const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Clean output folder')
      expect(stderr).toContain(`Build Sanity Studio`)

      const outputFolder = join(cwd, 'dist')
      const files = await readdir(outputFolder)
      expect(files).toContain('index.html')
      expect(files).toContain('static')
    })
  },
)
