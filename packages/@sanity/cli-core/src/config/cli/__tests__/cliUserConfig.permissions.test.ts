import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {clearCliTokenCache} from '../cliTokenCache.js'
import {getCliToken, getCliUserConfig, getUserConfig, setCliUserConfig} from '../cliUserConfig'

const modeOf = (filePath: string) => statSync(filePath).mode & 0o777

// The config file holds the CLI auth token and must only be readable by its owner.
// These use the real file system, so they need POSIX modes.
describe.skipIf(process.platform === 'win32')('cliUserConfig file permissions', () => {
  let tmpDir: string
  let configDir: string
  let configPath: string
  let previousUmask: number

  // Simulates a config file created by an affected CLI version (6.0.0 and later)
  const writeExistingConfig = (config: Record<string, unknown>, mode = 0o644) => {
    writeFileSync(configPath, JSON.stringify(config))
    chmodSync(configPath, mode)
  }

  beforeEach(() => {
    // The default umask on most systems, under which files used to be created world-readable
    previousUmask = process.umask(0o022)
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-user-config-perms-'))
    configDir = join(tmpDir, 'sanity')
    configPath = join(configDir, 'config.json')
    vi.stubEnv('SANITY_CLI_CONFIG_PATH', configPath)
    vi.stubEnv('SANITY_AUTH_TOKEN', '')
    clearCliTokenCache()
  })

  afterEach(() => {
    process.umask(previousUmask)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    clearCliTokenCache()
    rmSync(tmpDir, {force: true, recursive: true})
  })

  test('login creates the config file and directory readable by the owner only', () => {
    setCliUserConfig('authToken', 'sk-test-token')

    expect(modeOf(configPath)).toBe(0o600)
    expect(modeOf(configDir)).toBe(0o700)
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({authToken: 'sk-test-token'})
  })

  test('other config writes create the file readable by the owner only', () => {
    getUserConfig().set('telemetryConsent', {status: 'granted'})

    expect(modeOf(configPath)).toBe(0o600)
  })

  describe('existing world-readable config file', () => {
    beforeEach(() => {
      mkdirSync(configDir)
    })

    test('is tightened on login', () => {
      writeExistingConfig({authToken: 'old-token'})

      setCliUserConfig('authToken', 'new-token')

      expect(modeOf(configPath)).toBe(0o600)
    })

    test('is tightened when the token is read', async () => {
      writeExistingConfig({authToken: 'sk-test-token'})

      await expect(getCliToken()).resolves.toBe('sk-test-token')
      expect(modeOf(configPath)).toBe(0o600)
    })

    test('is tightened when any config value is read', () => {
      writeExistingConfig({telemetryConsent: 'granted'})

      expect(getUserConfig().get('telemetryConsent')).toBe('granted')
      expect(modeOf(configPath)).toBe(0o600)
    })

    test('is tightened when a config value is deleted', () => {
      writeExistingConfig({authToken: 'sk-test-token', telemetryConsent: 'granted'})

      getUserConfig().delete('telemetryConsent')

      expect(modeOf(configPath)).toBe(0o600)
      expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({authToken: 'sk-test-token'})
    })

    test('only loses group and other access, keeping the owner bits', () => {
      writeExistingConfig({authToken: 'sk-test-token'}, 0o464)

      expect(getCliUserConfig('authToken')).toBe('sk-test-token')
      expect(modeOf(configPath)).toBe(0o400)
    })

    test('is left alone when owned by another user', () => {
      writeExistingConfig({authToken: 'sk-test-token'})
      vi.spyOn(process, 'getuid').mockReturnValue(process.getuid!() + 1)

      expect(getCliUserConfig('authToken')).toBe('sk-test-token')
      expect(modeOf(configPath)).toBe(0o644)
    })

    test('is left alone on platforms without POSIX user IDs', () => {
      writeExistingConfig({authToken: 'sk-test-token'})
      const {getuid} = process
      Object.defineProperty(process, 'getuid', {configurable: true, value: undefined})

      try {
        expect(getCliUserConfig('authToken')).toBe('sk-test-token')
      } finally {
        Object.defineProperty(process, 'getuid', {configurable: true, value: getuid})
      }
      expect(modeOf(configPath)).toBe(0o644)
    })
  })

  test('reading a missing config file does not create it', () => {
    expect(getCliUserConfig('authToken')).toBeUndefined()
    expect(() => statSync(configPath)).toThrow(expect.objectContaining({code: 'ENOENT'}))
  })
})
