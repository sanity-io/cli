import {SchemaDeploy, SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockOutput} from '../../dev/__tests__/testHelpers.js'
import {deployStudioSchemasAndManifests} from '../deployStudioSchemasAndManifests.js'

const mockStudioWorkerTask = vi.hoisted(() => vi.fn())
const mockTraceStart = vi.hoisted(() => vi.fn())
const mockTraceComplete = vi.hoisted(() => vi.fn())
const mockTraceError = vi.hoisted(() => vi.fn())
const mockTrace = vi.hoisted(() =>
  vi.fn(() => ({
    complete: mockTraceComplete,
    error: mockTraceError,
    start: mockTraceStart,
  })),
)

vi.mock('@sanity/cli-core', () => ({
  getCliTelemetry: () => ({trace: mockTrace}),
  studioWorkerTask: mockStudioWorkerTask,
  subdebug: () => vi.fn(),
}))

const originalIsTTY = process.stdout.isTTY

beforeEach(() => {
  mockStudioWorkerTask.mockResolvedValue({
    studioManifest: {buildId: '"1"', bundleVersion: '6.0.0', workspaces: []},
    type: 'success',
  })
})

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: originalIsTTY})
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('deployStudioSchemasAndManifests', () => {
  test('runs worker task, logs hint, and forwards FORCE_COLOR on TTY without NO_COLOR', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: true})
    vi.stubEnv('NO_COLOR', '')
    const output = createMockOutput()

    const manifest = await deployStudioSchemasAndManifests(
      {
        applicationId: 'studio-1',
        configPath: '/studio/sanity.config.ts',
        isExternal: false,
        outPath: 'dist/static',
        schemaRequired: true,
        verbose: false,
        workDir: '/studio',
      },
      output,
    )

    expect(manifest).toEqual({buildId: '"1"', bundleVersion: '6.0.0', workspaces: []})
    expect(mockTrace).toHaveBeenCalledWith(SchemaDeploy, {
      extractManifest: true,
      manifestDir: 'dist/static',
      schemaRequired: true,
    })
    expect(mockTraceStart).toHaveBeenCalledTimes(1)
    expect(mockTraceComplete).toHaveBeenCalledTimes(1)
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('sanity schema list'))
    expect(mockStudioWorkerTask).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        applicationId: 'studio-1',
        env: expect.objectContaining({FORCE_COLOR: '1'}),
        name: 'deployStudioSchemasAndManifests',
        studioRootPath: '/studio',
        workerData: {
          configPath: '/studio/sanity.config.ts',
          isExternal: false,
          outPath: 'dist/static',
          schemaRequired: true,
          verbose: false,
          workDir: '/studio',
        },
      }),
    )
  })

  test('omits FORCE_COLOR when stdout is not a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: false})
    const output = createMockOutput()

    await deployStudioSchemasAndManifests(
      {
        configPath: '/studio/sanity.config.ts',
        isExternal: true,
        outPath: 'dist/static',
        schemaRequired: false,
        verbose: true,
        workDir: '/studio',
      },
      output,
    )

    expect(mockTrace).toHaveBeenCalledWith(SchemaDeploy, {
      extractManifest: false,
      manifestDir: 'dist/static',
      schemaRequired: false,
    })
    const workerOptions = mockStudioWorkerTask.mock.calls[0]?.[1]
    expect(workerOptions.env.FORCE_COLOR).toBeUndefined()
  })

  test('throws SchemaExtractionError and records trace error when worker returns error', async () => {
    const output = createMockOutput()
    const validation = [{path: [], problems: []}]
    mockStudioWorkerTask.mockResolvedValue({
      error: 'Broken schema',
      type: 'error',
      validation,
    })

    await expect(
      deployStudioSchemasAndManifests(
        {
          configPath: '/studio/sanity.config.ts',
          isExternal: false,
          outPath: 'dist/static',
          schemaRequired: true,
          verbose: false,
          workDir: '/studio',
        },
        output,
      ),
    ).rejects.toThrow(SchemaExtractionError)

    expect(mockTraceError).toHaveBeenCalledWith(expect.any(SchemaExtractionError))
    expect(mockTraceComplete).not.toHaveBeenCalled()
    expect(output.log).not.toHaveBeenCalled()
  })
})
