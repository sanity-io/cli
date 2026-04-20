import {describe, expect, test} from 'vitest'

import {getRunnerUpdateCommand} from '../getRunnerUpdateCommand.js'
import {type PackageRunner} from '../packageRunner.js'

describe('getRunnerUpdateCommand', () => {
  test('builds npx update command', () => {
    expect(getRunnerUpdateCommand('npx', 'sanity')).toBe('npx --yes sanity@latest')
    expect(getRunnerUpdateCommand('npx', '@sanity/cli')).toBe('npx --yes @sanity/cli@latest')
  })

  test('builds pnpm dlx update command', () => {
    expect(getRunnerUpdateCommand('pnpm-dlx', 'sanity')).toBe('pnpm dlx sanity@latest')
  })

  test('builds yarn dlx update command with -p and bin name', () => {
    expect(getRunnerUpdateCommand('yarn-dlx', 'sanity')).toBe('yarn dlx -p sanity@latest sanity')
    expect(getRunnerUpdateCommand('yarn-dlx', '@sanity/cli')).toBe(
      'yarn dlx -p @sanity/cli@latest sanity',
    )
  })

  test('builds bunx update command', () => {
    expect(getRunnerUpdateCommand('bunx', 'sanity')).toBe('bunx sanity@latest')
  })

  test('throws on an unknown runner kind (exhaustiveness guard)', () => {
    expect(() => getRunnerUpdateCommand('something-new' as PackageRunner, 'sanity')).toThrow(
      /Unknown runner: something-new/,
    )
  })
})
