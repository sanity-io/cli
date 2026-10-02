import {describe, expect, test} from 'vitest'

import {parseInitArgs, stripSeparators} from '../src/flags.js'

describe('parseInitArgs', () => {
  test('parses the unattended Studio flags', () => {
    const parsed = parseInitArgs(
      [
        '--yes',
        '--project',
        'abc123',
        '--dataset',
        'production',
        '--output-path',
        '/tmp/studio',
        '--template',
        'blog',
        '--typescript',
        '--package-manager',
        'npm',
        '--no-install',
        '--no-import-dataset',
        '--no-git',
        '--no-mcp',
        '--no-skills',
        '--no-auto-updates',
        '--from-create',
      ],
      true,
    )
    expect(parsed).toEqual({
      flags: {
        autoUpdates: false,
        dataset: 'production',
        datasetDefault: false,
        git: false,
        importDataset: false,
        install: false,
        mcp: false,
        organization: undefined,
        outputPath: '/tmp/studio',
        overwriteFiles: undefined,
        packageManager: 'npm',
        project: 'abc123',
        projectName: undefined,
        provider: undefined,
        skills: false,
        template: 'blog',
        typescript: true,
        unattended: true,
        visibility: undefined,
        yes: true,
      },
      kind: 'init',
    })
  })

  test('applies defaults and treats non-interactive runs as unattended', () => {
    const parsed = parseInitArgs([], false)
    expect(parsed.kind).toBe('init')
    if (parsed.kind !== 'init') return
    expect(parsed.flags).toMatchObject({
      autoUpdates: true,
      install: true,
      mcp: true,
      skills: true,
      unattended: true,
      yes: false,
    })
  })

  test('supports aliases and commit messages', () => {
    const parsed = parseInitArgs(['-y', '--project-id', 'p1', '--git', 'initial'], true)
    expect(parsed.kind === 'init' && parsed.flags).toMatchObject({git: 'initial', project: 'p1'})
  })

  test('returns help for --help and -h', () => {
    expect(parseInitArgs(['--help'], true)).toEqual({kind: 'help'})
    expect(parseInitArgs(['-h'], true)).toEqual({kind: 'help'})
  })

  test.each([
    [['--bare']],
    [['--env', '.env.local']],
    [['--coupon', 'abc']],
    [['--project-plan', 'growth']],
    [['--json']],
    [['--nextjs-embed-studio']],
    [['--template', 'app-quickstart']],
    [['--template', 'sanity-io/sanity-template-nextjs-clean']],
    [['--provider', 'vercel']],
  ])('delegates %j to sanity init', (args) => {
    expect(parseInitArgs(args, true).kind).toBe('delegate')
  })

  test.each([
    [['--not-a-flag'], 'Nonexistent flag: --not-a-flag'],
    [['--project'], 'Flag --project expects a value'],
    [['--install=yes'], "Option '--install' does not take an argument"],
    [['--package-manager', 'bun'], 'Expected --package-manager=bun to be one of: npm, yarn, pnpm'],
    [['--visibility', 'custom'], 'Expected --visibility=custom to be one of: public, private'],
    [
      ['--dataset', 'a', '--dataset-default'],
      '--dataset=a cannot also be provided when using --dataset-default',
    ],
    [['--project', 'a', '--project-name', 'b'], '--project=a cannot also be provided when using'],
    [['--git', 'msg', '--no-git'], '--no-git cannot also be provided when using --git'],
    [['a', 'b', 'c'], 'Unexpected arguments: b, c'],
  ])('reports %j as a usage error', (args, message) => {
    const parsed = parseInitArgs(args, true)
    expect(parsed).toMatchObject({exitCode: 2, kind: 'error'})
    expect(parsed.kind === 'error' && parsed.message).toContain(message)
    expect(parsed.kind === 'error' && parsed.message).toMatch(/See more help with --help$/)
  })

  test.each([
    ['plugin', 'Initializing plugins through the CLI is no longer supported'],
    ['app', 'Unknown init type "app"'],
  ])('rejects the %s init type', (type, message) => {
    expect(parseInitArgs([type], true)).toEqual({exitCode: 1, kind: 'error', message})
  })

  test('drops argument separators', () => {
    expect(stripSeparators(['--', '--project', 'p1', '--'])).toEqual(['--project', 'p1'])
  })
})
