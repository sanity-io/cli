import {createHash} from 'node:crypto'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {reportBlueprintSetup} from './reportBlueprintSetup.js'
import {sendBlueprintSetup} from './sendBlueprintSetup.worker.js'

const {createClient, readFile, request, spawn} = vi.hoisted(() => ({
  createClient: vi.fn(),
  readFile: vi.fn(),
  request: vi.fn(),
  spawn: vi.fn(),
}))
const privateDigest = createHash('sha256').update('private-token').digest('hex')
const storedDigest = createHash('sha256').update('stored-token').digest('hex')

vi.mock('node:fs/promises', () => ({readFile}))
vi.mock('@sanity/client', () => ({createClient}))

beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['BUILD_NUMBER', 'CI', 'CONTINUOUS_INTEGRATION', 'DO_NOT_TRACK']) {
    vi.stubEnv(name, '')
  }
  vi.stubEnv('SANITY_AUTH_TOKEN', ' private-token ')
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', '/test/config.json')
  vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
  createClient.mockReturnValue({request})
  readFile.mockRejectedValue(new Error('no config'))
  request.mockResolvedValue({status: 'granted'})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('launches the sender without keeping the setup process open', () => {
  const child = {on: vi.fn(), unref: vi.fn()}
  spawn.mockReturnValueOnce(child)
  vi.spyOn(process, 'getBuiltinModule').mockReturnValueOnce({spawn})

  reportBlueprintSetup('standalone', 'failed', 37, privateDigest)

  expect(spawn).toHaveBeenCalledExactlyOnceWith(
    process.execPath,
    [
      join(dirname(fileURLToPath(import.meta.url)), 'sendBlueprintSetup.worker.js'),
      'standalone',
      'failed',
      '37',
      privateDigest,
    ],
    {detached: true, stdio: 'ignore', windowsHide: true},
  )
  expect(child.unref).toHaveBeenCalledOnce()
  expect(child.on).toHaveBeenCalledExactlyOnceWith('error', expect.any(Function))
})

test.each(['CI', 'DO_NOT_TRACK'])('skips the background worker with %s enabled', (env) => {
  vi.stubEnv(env, 'True')
  const getBuiltinModule = vi.spyOn(process, 'getBuiltinModule')
  reportBlueprintSetup('standalone', 'success', 5, privateDigest)
  expect(getBuiltinModule).not.toHaveBeenCalled()
})

test('checks account consent and sends only the setup outcome', async () => {
  await sendBlueprintSetup('standalone', 'success', '23', privateDigest)

  expect(readFile).not.toHaveBeenCalled()
  expect(createClient).toHaveBeenCalledExactlyOnceWith({
    apiHost: 'https://api.sanity.work',
    apiVersion: 'v2026-01-22',
    maxRetries: 0,
    requestTagPrefix: 'sanity.cli',
    token: 'private-token',
    useCdn: false,
    useProjectHostname: false,
  })
  expect(request).toHaveBeenCalledTimes(2)
  expect(request).toHaveBeenNthCalledWith(1, {
    signal: expect.any(AbortSignal),
    tag: 'telemetry-consent',
    url: '/intake/telemetry-status',
  })
  expect(request).toHaveBeenNthCalledWith(2, {
    body: {
      batch: [
        {
          createdAt: expect.any(String),
          data: {durationMs: 23, outcome: 'success', route: 'standalone'},
          name: 'Create Sanity Blueprint Setup',
          redactionVersion: 1,
          sessionId: expect.stringMatching(/^session_[0-7][0-9a-hjkmnp-tv-z]{25}$/),
          source: 'cli',
          type: 'log',
          version: 1,
        },
      ],
    },
    json: true,
    method: 'POST',
    signal: expect.any(AbortSignal),
    url: '/intake/batch',
  })
})

test('reads the CLI login for a delegated run', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
  readFile.mockResolvedValueOnce('{"authToken":"stored-token"}')

  await sendBlueprintSetup('delegated', 'cancelled', '12', storedDigest)

  expect(readFile).toHaveBeenCalledExactlyOnceWith('/test/config.json', 'utf8')
  expect(createClient).toHaveBeenCalledWith(expect.objectContaining({token: 'stored-token'}))
  expect(request.mock.calls[1][0].body.batch[0].data).toEqual({
    durationMs: 12,
    outcome: 'cancelled',
    route: 'delegated',
  })
})

test('skips consent and collection if another login replaced the account used for setup', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
  readFile.mockResolvedValueOnce('{"authToken":"another-account-token"}')

  await sendBlueprintSetup('delegated', 'success', '12', storedDigest)

  expect(createClient).not.toHaveBeenCalled()
})

test.each(['denied', 'unset', 'unexpected', undefined])(
  'skips the batch when consent is %s',
  async (status) => {
    request.mockResolvedValueOnce({status})
    await sendBlueprintSetup('delegated', 'failed', '0', privateDigest)
    expect(request).toHaveBeenCalledOnce()
  },
)

test('skips consent and collection if there is no login', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
  await sendBlueprintSetup('delegated', 'failed', '0', privateDigest)
  expect(createClient).not.toHaveBeenCalled()
})

test.each(['BUILD_NUMBER', 'CI', 'CONTINUOUS_INTEGRATION', 'DO_NOT_TRACK'])(
  'skips consent and collection with %s enabled',
  async (env) => {
    vi.stubEnv(env, '1')
    await sendBlueprintSetup('standalone', 'success', '5', privateDigest)
    expect(createClient).not.toHaveBeenCalled()
  },
)

test.each([
  ['private-path', 'success', '10'],
  ['standalone', 'private-error', '10'],
  ['standalone', 'success', 'private-token'],
  ['standalone', 'success', '-1'],
])('rejects unexpected input (%s, %s, %s)', async (route, result, elapsed) => {
  await sendBlueprintSetup(route, result, elapsed, privateDigest)
  expect(createClient).not.toHaveBeenCalled()
})
