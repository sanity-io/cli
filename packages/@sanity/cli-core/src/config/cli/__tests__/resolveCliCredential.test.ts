import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {clearCliTokenCache} from '../cliTokenCache.js'
import {
  getCliToken,
  getUserConfig,
  resolveCliCredential,
  setCliUserConfig,
} from '../cliUserConfig.js'

// The resolver is the one place CLI credential precedence lives, so these tests run the real
// config store (via SANITY_CLI_CONFIG_PATH) and a real `.env` instead of mocking file readers.
let dir: string
let envPath: string
let configPath: string

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(configPath, JSON.stringify(config))
}

const ledger = {abc123: {projectId: 'abc123', token: 'sk-robot'}}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-resolve-cred-'))
  envPath = path.join(dir, '.env')
  configPath = path.join(dir, 'config.json')
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', configPath)
  // Isolate from the shell running the tests.
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
  vi.stubEnv('SANITY_PROJECT_ID', '')
  clearCliTokenCache()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  clearCliTokenCache()
  fs.rmSync(dir, {force: true, recursive: true})
})

describe('resolveCliCredential', () => {
  test('environment token only', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', ' env-token ')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'environment',
      token: 'env-token',
    })
  })

  test('minted-project token only, including the project id that selected it', async () => {
    writeConfig({unclaimedProjects: ledger})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
  })

  test('root .env minted-project token recovers when the ledger write is missing', async () => {
    writeConfig({authToken: 'session-token'})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-env-robot"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-env-robot',
    })
  })

  test('stored session only', async () => {
    writeConfig({authToken: 'session-token'})

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('no credential anywhere', async () => {
    await expect(resolveCliCredential(dir)).resolves.toEqual({source: 'none'})
  })

  test('environment token outranks the minted-project token', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')
    writeConfig({unclaimedProjects: ledger})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'environment',
      token: 'env-token',
    })
  })

  test('environment token outranks the stored session', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')
    writeConfig({authToken: 'session-token'})

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'environment',
      token: 'env-token',
    })
  })

  test('minted-project token outranks the stored session', async () => {
    writeConfig({authToken: 'session-token', unclaimedProjects: ledger})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
  })

  test('a blank environment token does not outrank anything', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', '   ')
    writeConfig({authToken: 'session-token'})

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('a malformed ledger falls through to the stored session', async () => {
    writeConfig({authToken: 'session-token', unclaimedProjects: 'not-an-object'})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('a ledger record without a token falls through to the stored session', async () => {
    writeConfig({authToken: 'session-token', unclaimedProjects: {abc123: {projectId: 'abc123'}}})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('a ledger record with an empty token falls through to the stored session', async () => {
    writeConfig({
      authToken: 'session-token',
      unclaimedProjects: {abc123: {projectId: 'abc123', token: ''}},
    })
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('a ledger record with a whitespace-only token falls through to the stored session', async () => {
    writeConfig({
      authToken: 'session-token',
      unclaimedProjects: {abc123: {projectId: 'abc123', token: '   '}},
    })
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })
  })

  test('the .env project id wins over a shell-exported SANITY_PROJECT_ID', async () => {
    vi.stubEnv('SANITY_PROJECT_ID', 'otherproj')
    writeConfig({
      unclaimedProjects: {
        ...ledger,
        otherproj: {projectId: 'otherproj', token: 'sk-wrong'},
      },
    })
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
  })

  test('is uncached: reflects a ledger change on the very next call', async () => {
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')
    writeConfig({authToken: 'session-token'})

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      source: 'session',
      token: 'session-token',
    })

    getUserConfig().set('unclaimedProjects', ledger)

    await expect(resolveCliCredential(dir)).resolves.toEqual({
      projectId: 'abc123',
      source: 'minted-project',
      token: 'sk-robot',
    })
  })
})

describe('getCliToken delegation', () => {
  test('a fresh login session displaces an invalid root .env token for this process', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    fs.writeFileSync(
      envPath,
      'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="invalid-mint-token"\n',
    )

    await expect(getCliToken()).resolves.toBe('invalid-mint-token')

    setCliUserConfig('authToken', 'fresh-session-token')
    await expect(getCliToken()).resolves.toBe('fresh-session-token')

    // The override is deliberately process-scoped. A new invocation resolves the mint token
    // normally, preserving pre-claim access for users who also have a stored login session.
    clearCliTokenCache()
    await expect(getCliToken()).resolves.toBe('invalid-mint-token')
  })

  test('resolves through the resolver and keeps caching the token', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    writeConfig({authToken: 'session-token'})

    await expect(getCliToken()).resolves.toBe('session-token')

    // Cached: a config change without invalidation is not observed...
    fs.writeFileSync(configPath, JSON.stringify({authToken: 'other-token'}))
    await expect(getCliToken()).resolves.toBe('session-token')
  })

  test('a ledger write invalidates the cache so the robot token takes over', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    writeConfig({authToken: 'session-token'})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(getCliToken()).resolves.toBe('session-token')

    // Recording a mint writes the ledger through the config store, which drops the cache.
    getUserConfig().set('unclaimedProjects', ledger)

    await expect(getCliToken()).resolves.toBe('sk-robot')
  })

  test('a ledger delete invalidates the cache so the session takes back over', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    writeConfig({authToken: 'session-token', unclaimedProjects: ledger})
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(getCliToken()).resolves.toBe('sk-robot')

    getUserConfig().delete('unclaimedProjects')

    await expect(getCliToken()).resolves.toBe('session-token')
  })

  test('returns undefined when the resolver finds no credential', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)

    await expect(getCliToken()).resolves.toBeUndefined()
  })

  test('a blank ledger token never shadows the stored session', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    writeConfig({
      authToken: 'session-token',
      unclaimedProjects: {abc123: {projectId: 'abc123', token: '   '}},
    })
    fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\n')

    await expect(getCliToken()).resolves.toBe('session-token')
  })
})
