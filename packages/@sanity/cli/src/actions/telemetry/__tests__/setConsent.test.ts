import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockIsCi = vi.hoisted(() => vi.fn())
const mockConfigGet = vi.hoisted(() => vi.fn())
const mockConfigSet = vi.hoisted(() => vi.fn())
const mockClientRequest = vi.hoisted(() => vi.fn())
const mockResolveConsent = vi.hoisted(() => vi.fn())
const mockTelemetryDebug = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({request: mockClientRequest}),
    getUserConfig: vi.fn().mockReturnValue({
      delete: vi.fn(),
      get: mockConfigGet,
      set: mockConfigSet,
    }),
    isCi: mockIsCi,
  }
})
vi.mock('../resolveConsent.js', async () => ({
  resolveConsent: mockResolveConsent,
}))
vi.mock('../telemetryDebug.js', async () => ({
  telemetryDebug: mockTelemetryDebug,
}))

const {setConsent} = await import('../setConsent.js')

describe('actions telemetry setConsent', () => {
  beforeEach(() => {
    mockIsCi.mockReturnValue(false)
    mockResolveConsent.mockResolvedValue({status: 'granted'})
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })
  test('should prevent changing consent if CI env detected', async () => {
    mockIsCi.mockReturnValue(true)
    const res = await setConsent({status: 'granted'})
    expect(res.changed).toEqual(false)
    expect(res.message).toMatch('CI env')
  })
  test('should prevent changing consent if DO_NOT_TRACK in env and status granted', async () => {
    vi.stubEnv('DO_NOT_TRACK', 'true')
    const res = await setConsent({status: 'granted'})
    expect(res.changed).toEqual(false)
    expect(res.message).toMatch('DO_NOT_TRACK')
  })
  test('should prevent changing consent if already at desired status', async () => {
    mockResolveConsent.mockResolvedValue({status: 'granted'})
    const res = await setConsent({status: 'granted'})
    expect(res.changed).toEqual(false)
    expect(res.message).toMatch('already enabled')
  })
  test('should require login if current consent status=undetermined and reason=unauthenticated', async () => {
    mockResolveConsent.mockResolvedValue({reason: 'unauthenticated', status: 'undetermined'})
    const res = await setConsent({status: 'granted'})
    expect(res.changed).toEqual(false)
    expect(res.message).toMatch('log in first')
  })
  test('should issue request to telemetry status uri based on provided status', async () => {
    mockResolveConsent.mockResolvedValue({status: 'denied'})
    const res = await setConsent({status: 'granted'})
    expect(res.changed).toEqual(true)
    expect(res.message).toMatch('enabled telemetry')
    expect(mockClientRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        uri: expect.stringContaining('telemetry/status/granted'),
      }),
    )
  })
  test('should reject if 403 received during telemetry status request', async () => {
    mockResolveConsent.mockResolvedValue({status: 'denied'})
    mockClientRequest.mockRejectedValue({message: 'nope', statusCode: 403})
    try {
      await setConsent({status: 'granted'})
      expect.fail('expected exception thrown')
    } catch (e) {
      expect(e).toEqual(expect.objectContaining({message: 'Failed to enable telemetry'}))
    }
  })
  test('should reject with generic failure message on non-http errors', async () => {
    mockResolveConsent.mockResolvedValue({status: 'denied'})
    mockClientRequest.mockRejectedValue({message: 'boom'})
    try {
      await setConsent({status: 'granted'})
      expect.fail('expected exception thrown')
    } catch (e) {
      expect(e).toEqual(
        expect.objectContaining({
          cause: expect.objectContaining({message: 'boom'}),
          message: 'Failed to enable telemetry',
        }),
      )
    }
  })
})
