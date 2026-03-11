import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  detectPackageManagerFromAgent,
  getBinCommand,
  getRunningPackageManager,
  getYarnMajorVersion,
} from '../packageManager.js'

describe('detectPackageManagerFromAgent', () => {
  test('detects npm', () => {
    expect(detectPackageManagerFromAgent('npm/10.2.0 node/v20.10.0 darwin arm64')).toBe('npm')
  })

  test('detects pnpm', () => {
    expect(detectPackageManagerFromAgent('pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')).toBe(
      'pnpm',
    )
  })

  test('detects yarn', () => {
    expect(detectPackageManagerFromAgent('yarn/1.22.19 npm/? node/v20.10.0 darwin arm64')).toBe(
      'yarn',
    )
  })

  test('detects bun', () => {
    expect(detectPackageManagerFromAgent('bun/1.0.25 npm/? node/v20.10.0 darwin arm64')).toBe('bun')
  })

  test('returns undefined for empty string', () => {
    expect(detectPackageManagerFromAgent('')).toBeUndefined()
  })

  test('returns undefined for unrecognised agent', () => {
    expect(detectPackageManagerFromAgent('unknown/1.0.0')).toBeUndefined()
  })

  test('does not false-positive on "npm/?" inside pnpm agent', () => {
    // pnpm user-agent contains "npm/?" which must NOT match npm
    expect(detectPackageManagerFromAgent('pnpm/8.15.1 npm/? node/v20.10.0')).toBe('pnpm')
  })

  test('does not false-positive on "npm/?" inside yarn agent', () => {
    expect(detectPackageManagerFromAgent('yarn/4.1.0 npm/? node/v20.10.0')).toBe('yarn')
  })
})

describe('getRunningPackageManager', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('reads from process.env.npm_config_user_agent', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
    expect(getRunningPackageManager()).toBe('pnpm')
  })

  test('returns undefined when env var is not set', () => {
    vi.stubEnv('npm_config_user_agent', '')
    expect(getRunningPackageManager()).toBeUndefined()
  })
})

describe('getYarnMajorVersion', () => {
  test('extracts major version from yarn 1.x', () => {
    expect(getYarnMajorVersion('yarn/1.22.19 npm/? node/v20.10.0')).toBe(1)
  })

  test('extracts major version from yarn 2.x', () => {
    expect(getYarnMajorVersion('yarn/2.4.3 npm/? node/v20.10.0')).toBe(2)
  })

  test('extracts major version from yarn 3.x', () => {
    expect(getYarnMajorVersion('yarn/3.6.1 npm/? node/v20.10.0')).toBe(3)
  })

  test('extracts major version from yarn 4.x', () => {
    expect(getYarnMajorVersion('yarn/4.1.0 npm/? node/v20.10.0')).toBe(4)
  })

  test('returns undefined for non-yarn agent', () => {
    expect(getYarnMajorVersion('npm/10.2.0 node/v20.10.0')).toBeUndefined()
  })

  test('returns undefined for empty string', () => {
    expect(getYarnMajorVersion('')).toBeUndefined()
  })
})

describe('getBinCommand', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('returns "npx sanity" for npm', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('npx sanity')
  })

  test('returns "pnpm exec sanity" for pnpm', () => {
    vi.stubEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('pnpm exec sanity')
  })

  test('returns "bunx sanity" for bun', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.0.25 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('bunx sanity')
  })

  test('returns "yarn sanity" for yarn 1.x', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.19 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('yarn sanity')
  })

  test('returns "yarn run sanity" for yarn 2+', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/2.4.3 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('yarn run sanity')
  })

  test('returns "yarn run sanity" for yarn 3+', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/3.6.1 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('yarn run sanity')
  })

  test('returns "yarn run sanity" for yarn 4+', () => {
    vi.stubEnv('npm_config_user_agent', 'yarn/4.1.0 npm/? node/v20.10.0 darwin arm64')
    expect(getBinCommand()).toBe('yarn run sanity')
  })

  test('returns bare bin name when no PM detected', () => {
    vi.stubEnv('npm_config_user_agent', '')
    expect(getBinCommand()).toBe('sanity')
  })

  test('accepts custom bin name', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    expect(getBinCommand({bin: 'my-cli'})).toBe('npx my-cli')
  })

  test('accepts userAgent override', () => {
    vi.stubEnv('npm_config_user_agent', 'npm/10.2.0 node/v20.10.0 darwin arm64')
    expect(getBinCommand({userAgent: 'pnpm/8.15.1 npm/? node/v20.10.0'})).toBe('pnpm exec sanity')
  })
})
