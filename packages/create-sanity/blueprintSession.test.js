import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {getBlueprintClient} from './blueprintSession.js'
import {loginForBlueprint} from './promptBlueprint.js'

const {getUser} = vi.hoisted(() => ({getUser: vi.fn()}))

vi.mock('@sanity/client', () => ({
  createClient: () => ({
    withConfig: ({token}) => ({users: {getById: (id) => getUser(token, id)}}),
  }),
  isHttpError: (error) => typeof error.statusCode === 'number',
}))
vi.mock('./promptBlueprint.js')

let directory
let configPath

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'create-sanity-session-'))
  configPath = join(directory, 'config.json')
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', configPath)
})

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, {force: true, recursive: true})
})

test('validates a saved CLI session before setup', async () => {
  await writeFile(configPath, JSON.stringify({authToken: 'saved-token'}))

  await getBlueprintClient({unattended: true}, vi.fn())

  expect(getUser).toHaveBeenCalledExactlyOnceWith('saved-token', 'me')
  expect(loginForBlueprint).not.toHaveBeenCalled()
})

test('uses the supplied token in preference to a saved session', async () => {
  await writeFile(configPath, JSON.stringify({authToken: 'saved-token'}))

  await getBlueprintClient({token: 'input-token', unattended: true}, vi.fn())

  expect(getUser).toHaveBeenCalledExactlyOnceWith('input-token', 'me')
  expect(loginForBlueprint).not.toHaveBeenCalled()
})

test.each([undefined, 'expired-token'])(
  'stops an unattended run without a valid session (%s)',
  async (token) => {
    if (token) {
      await writeFile(configPath, JSON.stringify({authToken: token}))
      getUser.mockRejectedValue(Object.assign(new Error('Unauthorized'), {statusCode: 401}))
    }
    await expect(getBlueprintClient({unattended: true}, vi.fn())).rejects.toThrow(
      'Set SANITY_AUTH_TOKEN',
    )
    expect(loginForBlueprint).not.toHaveBeenCalled()
  },
)

test('prompts for a new session and saves it in the existing config file', async () => {
  await writeFile(
    configPath,
    JSON.stringify({authToken: 'expired-token', keep: true, telemetryConsent: 'granted'}),
  )
  getUser.mockRejectedValueOnce(Object.assign(new Error('Expired'), {statusCode: 401}))
  vi.mocked(loginForBlueprint).mockResolvedValue('new-token')

  await getBlueprintClient({unattended: false}, vi.fn())

  expect(getUser.mock.calls).toEqual([
    ['expired-token', 'me'],
    ['new-token', 'me'],
  ])
  expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
    authToken: 'new-token',
    keep: true,
  })
  if (process.platform !== 'win32') {
    expect((await stat(configPath)).mode & 0o777).toBe(0o600)
  }
})

test('does not replace an explicitly supplied rejected token with another identity', async () => {
  await writeFile(configPath, JSON.stringify({authToken: 'saved-token'}))
  getUser.mockRejectedValue(Object.assign(new Error('Invalid'), {statusCode: 403}))

  await expect(
    getBlueprintClient({token: 'input-token', unattended: false}, vi.fn()),
  ).rejects.toThrow('Set SANITY_AUTH_TOKEN')
  expect(getUser).toHaveBeenCalledExactlyOnceWith('input-token', 'me')
  expect(loginForBlueprint).not.toHaveBeenCalled()
})

test('propagates API errors during session validation', async () => {
  const error = Object.assign(new Error('Server busy'), {statusCode: 503})
  getUser.mockRejectedValue(error)

  await expect(getBlueprintClient({token: 'test'}, vi.fn())).rejects.toBe(error)
  expect(loginForBlueprint).not.toHaveBeenCalled()
})
