import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveConsent} from '../resolveConsent.js'

const mockIsCi = vi.hoisted(() => vi.fn())
const mockGetCliToken = vi.hoisted(() => vi.fn())
const mockFetchTelemetry = vi.hoisted(() => vi.fn())
const mockTelemetryDebug = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliToken: mockGetCliToken,
    isCi: mockIsCi,
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
    mockIsCi.mockReturnValue(false)
    mockGetCliToken.mockResolvedValue('fake-token')
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })
  test('should return denied consent if CI env detected', async () => {
    mockIsCi.mockReturnValue(true)
    const res = await resolveConsent()
    expect(res.status).toEqual('denied')
  })
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
