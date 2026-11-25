import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveConsent} from '../resolveConsent.js'

const mockGetCliToken = vi.hoisted(() => vi.fn())
const mockFetchTelemetry = vi.hoisted(() => vi.fn())
const mockTelemetryDebug = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliToken: mockGetCliToken,
  }
})
vi.mock('../../../services/telemetry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/telemetry.js')>()
  return {
    ...actual,
    fetchTelemetryConsent: mockFetchTelemetry,
  }
})
vi.mock('../telemetryDebug.js', async () => ({
  telemetryDebug: mockTelemetryDebug,
}))

describe('actions telemetry resolveConsent', () => {
  beforeEach(() => {
    for (const name of ['BUILD_NUMBER', 'CI', 'CONTINUOUS_INTEGRATION', 'DO_NOT_TRACK']) {
      vi.stubEnv(name, undefined)
    }
    mockGetCliToken.mockResolvedValue('fake-token')
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })
  test.each(['BUILD_NUMBER', 'CI', 'CONTINUOUS_INTEGRATION'])(
    'should return denied consent if %s indicates CI',
    async (name) => {
      vi.stubEnv(name, '1')
      expect(await resolveConsent()).toEqual({status: 'denied'})
      expect(mockFetchTelemetry).not.toHaveBeenCalled()
    },
  )
  test('should return denied consent if DO_NOT_TRACK in env', async () => {
    vi.stubEnv('DO_NOT_TRACK', 'true')
    const res = await resolveConsent()
    expect(res.status).toEqual('denied')
  })
  test('should return unauthenticated if no CLI token returned', async () => {
    mockGetCliToken.mockResolvedValue(null)
    const res = await resolveConsent()
    expect(res.status).toEqual('undetermined')
    expect(res.reason).toEqual('unauthenticated')
  })
  test('should return response from telemetry fetch', async () => {
    mockFetchTelemetry.mockResolvedValue({status: 'granted'})
    const res = await resolveConsent()
    expect(res.status).toEqual('granted')
  })
  test('ignores host CI and DO_NOT_TRACK state under an execution context', async () => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('DO_NOT_TRACK', 'true')
    mockFetchTelemetry.mockResolvedValue({status: 'granted'})

    const res = await runWithCliExecutionContext({token: 'context-token'}, () => resolveConsent())

    expect(res.status).toEqual('granted')
    expect(mockFetchTelemetry).toHaveBeenCalled()
  })
  test('should return undetermined status from telemetry fetch if it throws', async () => {
    mockFetchTelemetry.mockRejectedValue({message: 'boom'})
    const res = await resolveConsent()
    expect(res.status).toEqual('undetermined')
    expect(res.reason).toEqual('fetchError')
  })
  test('should return undetermined status from telemetry fetch if it returns unrecognized status', async () => {
    mockFetchTelemetry.mockResolvedValue({status: 'unacceptable'})
    const res = await resolveConsent()
    expect(res.status).toEqual('undetermined')
    expect(res.reason).toEqual('fetchError')
  })
})
