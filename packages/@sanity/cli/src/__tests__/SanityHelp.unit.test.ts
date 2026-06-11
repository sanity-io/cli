import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  prefixBinName,
  replaceInitWithCreateCommand,
  resolveTopicAliasInArgv,
} from '../SanityHelp.js'

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

// Simulates a realistic oclif help output for the `init` command
function makeInitHelp() {
  return [
    'Initialize a new Sanity project',
    '',
    'USAGE',
    '  $ sanity init [--bare] [--env <value>] [--project <value>] [--dataset <value>]',
    '',
    'FLAGS',
    '  --bare              Minimal Sanity starter',
    '  --dataset=<value>   Dataset name',
    '  --env=<value>       Environment variable file',
    '  --project=<value>   Project ID',
    '',
    'DESCRIPTION',
    '  Initialize a new Sanity project',
    '',
    'EXAMPLES',
    '  $ sanity init',
    '',
    '  $ sanity init --bare',
    '',
    '  $ sanity init --project my-project --dataset production',
    '',
  ].join('\n')
}

describe('replaceInitWithCreateCommand', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('pnpm', () => {
    const UA = 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64'

    test('replaces USAGE line without flag separator', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ pnpm create sanity@latest [--bare]')
    })

    test('replaces example with flags', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ pnpm create sanity@latest --bare')
      expect(result).toContain(
        '$ pnpm create sanity@latest --project my-project --dataset production',
      )
    })

    test('replaces bare example (no flags)', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      // The bare "$ sanity init\n" line gets the first regex (no flag separator)
      expect(result).toContain('$ pnpm create sanity@latest\n')
    })

    test('removes all "sanity init" references', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).not.toMatch(/sanity\s+init/)
    })
  })

  describe('npm', () => {
    const UA = 'npm/10.2.0 node/v20.10.0 darwin arm64'

    test('replaces USAGE line with -- flag separator', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ npm create sanity@latest -- [--bare]')
    })

    test('replaces examples with flags using -- separator', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ npm create sanity@latest -- --bare')
      expect(result).toContain(
        '$ npm create sanity@latest -- --project my-project --dataset production',
      )
    })

    test('bare example (no flags) does NOT include -- separator', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      // The bare line "$ sanity init\n" is replaced by the first regex which
      // doesn't add --. Verify there's no "-- " or "--\n" after the create command
      // on this specific line.
      const lines = result.split('\n')
      const bareLine = lines.find(
        (l) =>
          l.includes('npm create sanity@latest') &&
          !l.includes('--bare') &&
          !l.includes('--project'),
      )
      expect(bareLine).toBeDefined()
      expect(bareLine).not.toContain(' -- ')
      expect(bareLine).not.toMatch(/--\s*$/)
    })

    test('removes all "sanity init" references', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).not.toMatch(/sanity\s+init/)
    })
  })

  describe('yarn', () => {
    const UA = 'yarn/1.22.19 npm/? node/v20.10.0 darwin arm64'

    test('replaces with yarn create sanity (no @latest, no flag separator)', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ yarn create sanity [--bare]')
      expect(result).toContain('$ yarn create sanity --bare')
      expect(result).not.toContain('@latest')
    })

    test('removes all "sanity init" references', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).not.toMatch(/sanity\s+init/)
    })
  })

  describe('bun', () => {
    const UA = 'bun/1.0.25 npm/? node/v20.10.0 darwin arm64'

    test('replaces with bun create sanity@latest (no flag separator)', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ bun create sanity@latest [--bare]')
      expect(result).toContain('$ bun create sanity@latest --bare')
    })

    test('removes all "sanity init" references', () => {
      vi.stubEnv('npm_config_user_agent', UA)
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).not.toMatch(/sanity\s+init/)
    })
  })

  describe('unknown package manager', () => {
    test('falls back to npm create with -- flag separator', () => {
      vi.stubEnv('npm_config_user_agent', '')
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('$ npm create sanity@latest -- [--bare]')
      expect(result).toContain('$ npm create sanity@latest -- --bare')
    })
  })

  describe('does not replace non-init references', () => {
    test('preserves description text containing "sanity"', () => {
      vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
      const result = replaceInitWithCreateCommand(makeInitHelp())
      expect(result).toContain('Initialize a new Sanity project')
    })

    test('does not touch "sanity" without "init"', () => {
      vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
      const input = '  $ sanity deploy\n'
      const result = replaceInitWithCreateCommand(input)
      expect(result).toBe(input)
    })
  })
})

describe('replaceInitWithCreateCommand + prefixBinName interaction', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('pnpm: prefixBinName does not double-replace already-substituted create commands', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
    const afterCreate = replaceInitWithCreateCommand(makeInitHelp())
    const result = prefixBinName(afterCreate)

    // prefixBinName replaces "$ sanity" → "$ pnpm exec sanity", but after
    // replaceInitWithCreateCommand there should be no "$ sanity" left
    expect(result).not.toContain('$ pnpm exec sanity')
    expect(result).toContain('$ pnpm create sanity@latest')
    // No mangled combo like "pnpm exec sanity create" or "pnpm exec pnpm create"
    expect(result).not.toContain('exec sanity create')
    expect(result).not.toContain('exec pnpm')
  })

  test('npm: prefixBinName does not double-replace already-substituted create commands', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    const afterCreate = replaceInitWithCreateCommand(makeInitHelp())
    const result = prefixBinName(afterCreate)

    expect(result).not.toContain('$ npx sanity')
    expect(result).toContain('$ npm create sanity@latest')
    expect(result).not.toContain('npx sanity create')
    expect(result).not.toContain('npx npm')
  })

  test('bun: prefixBinName does not double-replace already-substituted create commands', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.25 npm/? node/v20.10.0 darwin arm64')
    const afterCreate = replaceInitWithCreateCommand(makeInitHelp())
    const result = prefixBinName(afterCreate)

    expect(result).not.toContain('$ bunx sanity')
    expect(result).toContain('$ bun create sanity@latest')
    expect(result).not.toContain('bunx sanity create')
    expect(result).not.toContain('bunx bun')
  })

  test('yarn: prefixBinName does not double-replace already-substituted create commands', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.19 npm/? node/v20.10.0 darwin arm64')
    const afterCreate = replaceInitWithCreateCommand(makeInitHelp())
    const result = prefixBinName(afterCreate)

    expect(result).not.toContain('$ yarn sanity')
    expect(result).toContain('$ yarn create sanity')
    expect(result).not.toContain('yarn sanity create')
  })

  test('unknown PM: prefixBinName is no-op (binCommand is "sanity")', () => {
    vi.stubEnv('npm_config_user_agent', '')
    const afterCreate = replaceInitWithCreateCommand(makeInitHelp())
    const result = prefixBinName(afterCreate)

    // With unknown PM, getBinCommand returns "sanity" so prefixBinName is a no-op
    expect(result).toBe(afterCreate)
  })
})

describe('resolveTopicAliasInArgv', () => {
  test('resolves singular topic alias to canonical plural form', () => {
    expect(resolveTopicAliasInArgv(['dataset', '--help'])).toEqual(['datasets', '--help'])
  })

  test('resolves other singular aliases', () => {
    expect(resolveTopicAliasInArgv(['document', '--help'])).toEqual(['documents', '--help'])
    expect(resolveTopicAliasInArgv(['user', '--help'])).toEqual(['users', '--help'])
    expect(resolveTopicAliasInArgv(['token', '--help'])).toEqual(['tokens', '--help'])
    expect(resolveTopicAliasInArgv(['project', '--help'])).toEqual(['projects', '--help'])
    expect(resolveTopicAliasInArgv(['hook', '--help'])).toEqual(['hooks', '--help'])
    expect(resolveTopicAliasInArgv(['backup', '--help'])).toEqual(['backups', '--help'])
    expect(resolveTopicAliasInArgv(['schema', '--help'])).toEqual(['schemas', '--help'])
  })

  test('does not modify argv for canonical topic names', () => {
    expect(resolveTopicAliasInArgv(['datasets', '--help'])).toEqual(['datasets', '--help'])
  })

  test('does not modify argv for unknown topics', () => {
    expect(resolveTopicAliasInArgv(['unknown', '--help'])).toEqual(['unknown', '--help'])
  })

  test('resolves alias with subcommand in argv', () => {
    expect(resolveTopicAliasInArgv(['dataset', 'list', '--help'])).toEqual([
      'datasets',
      'list',
      '--help',
    ])
  })

  test('returns original argv when no positional argument found', () => {
    expect(resolveTopicAliasInArgv(['--help'])).toEqual(['--help'])
  })

  test('returns original argv for empty input', () => {
    expect(resolveTopicAliasInArgv([])).toEqual([])
  })

  test('stops processing at -- separator', () => {
    expect(resolveTopicAliasInArgv(['--', 'dataset', '--help'])).toEqual([
      '--',
      'dataset',
      '--help',
    ])
  })
})
