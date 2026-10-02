import {describe, expect, test, vi} from 'vitest'

import {pinnedCliCommand, resolveRunner, spawnArgs} from '../src/runner.js'

describe('resolveRunner', () => {
  test.each([
    ['/home/u/.npm/_npx/abc123/node_modules/.bin/create-sanity', '', 'npx'],
    ['/home/u/.cache/pnpm/dlx/abc/node_modules/.bin/create-sanity', '', 'pnpm-dlx'],
    ['/tmp/xfs-1a2b/dlx-123/node_modules/.bin/create-sanity', '', 'yarn-dlx'],
    ['/tmp/bunx-501-create-sanity@latest/node_modules/.bin/create-sanity', '', 'bunx'],
  ])('detects %s from the install path', (path, ua, runner) => {
    expect(resolveRunner(path, ua)).toBe(runner)
  })

  test.each([
    ['pnpm/10.7.1 npm/? node/v22.14.0 darwin arm64', 'pnpm-dlx'],
    ['yarn/4.5.0 npm/? node/v22.14.0 darwin arm64', 'yarn-dlx'],
    ['yarn/1.22.22 npm/? node/v22.14.0 darwin arm64', 'npx'],
    ['bun/1.2.0 npm/? node/v22.14.0 darwin arm64', 'bunx'],
    ['npm/10.9.0 node/v22.14.0 darwin arm64', 'npx'],
    ['', 'npx'],
  ])('falls back to the user agent %j', (ua, runner) => {
    expect(resolveRunner('/usr/local/bin/create-sanity', ua)).toBe(runner)
  })
})

describe('pinnedCliCommand', () => {
  test('runs the pinned CLI through the detected runner', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/4.5.0 npm/? node/v22')
    expect(pinnedCliCommand('1.2.3', ['init', '-y'])).toEqual([
      'yarn',
      'dlx',
      '-p',
      '@sanity/cli@1.2.3',
      'sanity',
      'init',
      '-y',
    ])
    vi.unstubAllEnvs()
  })
})

describe('spawnArgs', () => {
  test('passes arguments through as-is outside Windows', () => {
    expect(spawnArgs('npx', ['--project-name', 'My Studio'], 'linux')).toEqual({
      args: ['--project-name', 'My Studio'],
      command: 'npx',
      shell: false,
    })
  })

  test('quotes arguments for cmd.exe on Windows', () => {
    expect(spawnArgs('npx', ['--project-name', 'My "Big" Studio', 'a&b'], 'win32')).toEqual({
      args: ['--project-name', '"My ""Big"" Studio"', '"a&b"'],
      command: 'npx',
      shell: true,
    })
    expect(spawnArgs(process.execPath, ['a b'], 'win32').shell).toBe(false)
  })
})
