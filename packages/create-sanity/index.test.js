import {createHash} from 'node:crypto'

// eslint-disable-next-line import-js/no-extraneous-dependencies -- Vitest is a test-only dependency
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

const {bootstrapBlueprint, reportBlueprintSetup, runInit} = vi.hoisted(() => ({
  bootstrapBlueprint: vi.fn(),
  reportBlueprintSetup: vi.fn(),
  runInit: vi.fn(),
}))

vi.mock('./bootstrapBlueprint.js', () => ({bootstrapBlueprint}))
vi.mock('./reportBlueprintSetup.js', () => ({reportBlueprintSetup}))
vi.mock('./runInit.js', () => ({runInit}))

const blueprintArgs = ['--with-blueprints', '--yes', '--project', 'private-id', '--dataset', 'prod']
const standaloneDigest = createHash('sha256').update('private-token').digest('hex')
const delegatedDigest = createHash('sha256').update('delegated-token').digest('hex')
const originalArgs = process.argv
const originalExitCode = process.exitCode

async function run(args) {
  process.argv = [...originalArgs.slice(0, 2), ...args]
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- run the entry point with fresh arguments
  await import('./index.js')
  return process.exitCode
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  for (const name of [
    'BUILD_NUMBER',
    'CI',
    'CONTINUOUS_INTEGRATION',
    'DO_NOT_TRACK',
    'SANITY_AUTH_TOKEN',
  ]) {
    vi.stubEnv(name, '')
  }
  runInit.mockResolvedValue({code: 0, signal: null})
})

afterEach(() => {
  process.argv = originalArgs
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('reports standalone setup once after completion', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', 'private-token')
  bootstrapBlueprint.mockImplementationOnce(() => {
    expect(reportBlueprintSetup).not.toHaveBeenCalled()
  })

  await run(blueprintArgs)

  expect(bootstrapBlueprint).toHaveBeenCalledOnce()
  expect(runInit).not.toHaveBeenCalled()
  expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
    'standalone',
    'success',
    expect.any(Number),
    standaloneDigest,
  )
})

test('reports a standalone failure while preserving its error and exit code', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', 'private-token')
  bootstrapBlueprint.mockRejectedValueOnce(new Error('a private error'))
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

  expect(await run(blueprintArgs)).toBe(1)

  expect(stderr).toHaveBeenCalledWith('a private error\n')
  expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
    'standalone',
    'failed',
    expect.any(Number),
    standaloneDigest,
  )
})

test.each([
  [{code: 0, signal: null}, 0, 'success'],
  [{code: 2, signal: null}, 2, 'failed'],
  [{code: 3, signal: null}, 3, 'cancelled'],
  [{code: 130, signal: null}, 130, 'cancelled'],
  [{code: 0xc0_00_01_3a, signal: null}, -1_073_741_510, 'cancelled'],
  [{code: -1_073_741_510, signal: null}, -1_073_741_510, 'cancelled'],
  [{code: null, signal: 'SIGINT'}, 1, 'cancelled'],
])('reports delegated setup with child result %j', async (result, exitCode, outcome) => {
  runInit.mockImplementationOnce(async (_args, onTokenDigest) => {
    onTokenDigest(delegatedDigest)
    return result
  })

  expect(await run(blueprintArgs)).toBe(exitCode)

  expect(runInit).toHaveBeenCalledExactlyOnceWith(blueprintArgs, expect.any(Function))
  expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
    'delegated',
    outcome,
    expect.any(Number),
    delegatedDigest,
  )
})

test.each([
  ['--yes'],
  ['--with-blueprints', '--help'],
  ['--with-blueprints', '-h'],
  ['--', '--with-blueprints'],
])('skips setup telemetry for %j', async (...args) => {
  await run(args)
  expect(reportBlueprintSetup).not.toHaveBeenCalled()
})

test.each(['darwin', 'win32'])(
  'records Ctrl+C once and preserves the interrupt on %s',
  async (platform) => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'private-token')
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const exit = vi.spyOn(process, 'exit').mockImplementationOnce(() => {})
    bootstrapBlueprint.mockImplementationOnce(() => {
      const onInterrupt = process.rawListeners('SIGINT').at(-1)
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {value: platform})
      try {
        onInterrupt()
      } finally {
        Object.defineProperty(process, 'platform', {value: originalPlatform})
      }
    })

    await run(blueprintArgs)

    if (platform === 'win32') {
      expect(exit).toHaveBeenCalledExactlyOnceWith(0xc0_00_01_3a)
      expect(kill).not.toHaveBeenCalled()
    } else {
      expect(kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGINT')
      expect(exit).not.toHaveBeenCalled()
    }
    expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
      'standalone',
      'cancelled',
      expect.any(Number),
      standaloneDigest,
    )
  },
)

test('skips delegated telemetry when the CLI did not identify its account', async () => {
  expect(await run(blueprintArgs)).toBe(0)
  expect(reportBlueprintSetup).not.toHaveBeenCalled()
})

test('skips the delegated telemetry channel when telemetry is disabled', async () => {
  vi.stubEnv('DO_NOT_TRACK', '1')
  expect(await run(blueprintArgs)).toBe(0)
  expect(runInit).toHaveBeenCalledOnce()
  expect(runInit.mock.calls[0][1]).toBeUndefined()
  expect(reportBlueprintSetup).not.toHaveBeenCalled()
})

test('ignores a telemetry launch failure', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', 'private-token')
  reportBlueprintSetup.mockImplementationOnce(() => {
    throw new Error('worker could not start')
  })
  expect(await run(blueprintArgs)).toBe(originalExitCode)
  expect(reportBlueprintSetup).toHaveBeenCalledOnce()
})
