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
  vi.stubEnv('SANITY_AUTH_TOKEN', '')
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
  )
})

test.each([
  [{code: 0, signal: null}, 0, 'success'],
  [{code: 2, signal: null}, 2, 'failed'],
  [{code: 3, signal: null}, 3, 'cancelled'],
  [{code: 130, signal: null}, 130, 'cancelled'],
  [{code: null, signal: 'SIGINT'}, 1, 'cancelled'],
])('reports delegated setup with child result %j', async (result, exitCode, outcome) => {
  runInit.mockResolvedValueOnce(result)

  expect(await run(blueprintArgs)).toBe(exitCode)

  expect(runInit).toHaveBeenCalledExactlyOnceWith(blueprintArgs)
  expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
    'delegated',
    outcome,
    expect.any(Number),
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

test('records Ctrl+C once and re-raises the signal before setup can resume', async () => {
  vi.stubEnv('SANITY_AUTH_TOKEN', 'private-token')
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  let interruptResult
  let raisedSynchronously = false
  bootstrapBlueprint.mockImplementationOnce(() => {
    const onInterrupt = process.rawListeners('SIGINT').at(-1)
    interruptResult = onInterrupt()
    raisedSynchronously = kill.mock.calls.length === 1
  })

  await run(blueprintArgs)
  await interruptResult

  expect(raisedSynchronously).toBe(true)
  expect(kill).toHaveBeenCalledWith(process.pid, 'SIGINT')
  expect(reportBlueprintSetup).toHaveBeenCalledExactlyOnceWith(
    'standalone',
    'cancelled',
    expect.any(Number),
  )
})

test('ignores a telemetry launch failure', async () => {
  reportBlueprintSetup.mockImplementationOnce(() => {
    throw new Error('worker could not start')
  })
  expect(await run(blueprintArgs)).toBe(0)
})
