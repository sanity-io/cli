import {readdir, readFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {testCommand, testExample} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {BuildCommand} from '../build.js'

describe(
  '#build',
  // might help with speed of tests if not ran concurrently
  {concurrent: false, timeout: (platform() === 'win32' ? 60 : 30) * 1000},
  () => {
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

      const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes'], {
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

    // TODO: Fix this so it works in CI
    test.skip("should build the 'worst-case-studio' example", {timeout: 15_000}, async () => {
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
