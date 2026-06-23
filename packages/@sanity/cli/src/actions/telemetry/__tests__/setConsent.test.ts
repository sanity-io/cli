import {afterEach, describe, test, vi} from 'vitest'

const mockIsCi = vi.hoisted(() => vi.fn())
const mockConfigGet = vi.hoisted(() => vi.fn())
const mockConfigSet = vi.hoisted(() => vi.fn())
const mockResolveConsent = vi.hoisted(() => vi.fn())
const mockTelemetryDebug = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn(),
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

describe('actions telemetry setConsent', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
  test('should prevent changing consent if CI env detected')
  test('should prevent changing consent if DO_NOT_TRACK in env and status granted')
  test('should prevent changing consent if already at desired status')
  test('should require login if current consent status=undetermined and reason=unauthenticated')
})
