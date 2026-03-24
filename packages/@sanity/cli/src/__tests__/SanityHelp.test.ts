import {afterEach, describe, expect, test, vi} from 'vitest'

import {prefixBinName} from '../SanityHelp.js'

describe('prefixBinName', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('replaces "$ sanity" with prefixed bin command', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    const input = [
      'USAGE',
      '  $ sanity [COMMAND]',
      '',
      'TOPICS',
      '  backup      Manage backups.',
      '  blueprints  Deploy and manage Sanity Blueprints',
    ].join('\n')

    const result = prefixBinName(input)
    expect(result).toContain('$ npx sanity [COMMAND]')
    expect(result).toContain('Manage backups.')
  })

  test('replaces all occurrences of "$ sanity"', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
    const input = [
      'USAGE',
      '  $ sanity build [FLAGS]',
      '',
      'EXAMPLES',
      '  $ sanity build',
      '  $ sanity build --output-dir ./dist',
    ].join('\n')

    const result = prefixBinName(input)
    expect(result).toContain('$ pnpm exec sanity build [FLAGS]')
    expect(result).toContain('$ pnpm exec sanity build\n')
    expect(result).toContain('$ pnpm exec sanity build --output-dir ./dist')
  })

  test('does not modify text when no package manager is detected', () => {
    vi.stubEnv('npm_config_user_agent', '')
    const input = '  $ sanity build [FLAGS]'
    expect(prefixBinName(input)).toBe(input)
  })

  test('does not replace "Sanity" (capitalized product name)', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    const input = 'Builds the Sanity Studio configuration'
    expect(prefixBinName(input)).toBe(input)
  })

  test('does not replace "sanity" in non-command contexts', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    const input = 'The sanity config file'
    expect(prefixBinName(input)).toBe(input)
  })
})
