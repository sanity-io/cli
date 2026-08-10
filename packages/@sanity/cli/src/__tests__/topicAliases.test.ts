import {describe, expect, test} from 'vitest'

import {resolveTopicAlias, resolveTopicAliasInArgv} from '../topicAliases.js'

describe('resolveTopicAlias', () => {
  test('resolves a bare topic alias', () => {
    expect(resolveTopicAlias('hook')).toBe('hooks')
  })

  test('resolves an alias in a colon-separated command ID', () => {
    expect(resolveTopicAlias('hook:list')).toBe('hooks:list')
  })

  test('does not resolve canonical or unknown topics', () => {
    expect(resolveTopicAlias('hooks:list')).toBeUndefined()
    expect(resolveTopicAlias('unknown:list')).toBeUndefined()
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

  test('resolves a colon-separated alias', () => {
    expect(resolveTopicAliasInArgv(['hook:list', '--help'])).toEqual(['hooks:list', '--help'])
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
