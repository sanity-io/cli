import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SchemaBuild} from '../../../telemetry/extractSchema.telemetry.js'
import {buildStudioSchemasAndManifests} from '../buildStudioSchemasAndManifests.js'
import {buildStudioSchemasAndManifestsWorkerData} from '../types.js'
import {SchemaExtractionError} from '../utils/SchemaExtractionError.js'

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
    schemaInputs: [],
    studioManifest: null,
    type: 'success',
  })
})

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: originalIsTTY})
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('buildStudioSchemasAndManifests', () => {
  test('runs worker task, records telemetry, and forwards FORCE_COLOR on TTY without NO_COLOR', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: true})
    vi.stubEnv('NO_COLOR', '')

    const result = await buildStudioSchemasAndManifests('app-1', {
      configPath: '/studio/sanity.config.ts',
      isExternal: false,
      outPath: 'dist/static',
      projectId: 'legacy-proj',
      schemaRequired: true,
      verbose: false,
      workDir: '/studio',
    })

    expect(result).toEqual({
      schemaInputs: [],
      studioManifest: null,
      type: 'success',
    })
    expect(mockTrace).toHaveBeenCalledWith(SchemaBuild, {
      extractManifest: true,
      manifestDir: 'dist/static',
    })
    expect(mockTraceStart).toHaveBeenCalledTimes(1)
    expect(mockTraceComplete).toHaveBeenCalledTimes(1)
    expect(mockStudioWorkerTask).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        applicationId: 'app-1',
        env: expect.objectContaining({FORCE_COLOR: '1'}),
        name: 'buildStudioSchemasAndManifests',
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

  test('omits FORCE_COLOR when stdout is not a TTY or NO_COLOR is set', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: false})

    await buildStudioSchemasAndManifests('app-1', {
      configPath: '/studio/sanity.config.ts',
      isExternal: true,
      outPath: 'dist/static',
      schemaRequired: false,
      verbose: true,
      workDir: '/studio',
    })

    expect(mockTrace).toHaveBeenCalledWith(SchemaBuild, {
      extractManifest: false,
      manifestDir: 'dist/static',
    })
    const workerOptions = mockStudioWorkerTask.mock.calls[0]?.[1]
    expect(workerOptions.env.FORCE_COLOR).toBeUndefined()
  })

  test('throws SchemaExtractionError and records trace error when worker returns error message', async () => {
    const validation = [{path: [], problems: []}]
    mockStudioWorkerTask.mockResolvedValue({
      error: 'Invalid schema',
      type: 'error',
      validation,
    })

    await expect(
      buildStudioSchemasAndManifests('app-1', {
        configPath: '/studio/sanity.config.ts',
        isExternal: false,
        outPath: 'dist/static',
        schemaRequired: true,
        verbose: false,
        workDir: '/studio',
      }),
    ).rejects.toThrow(SchemaExtractionError)

    expect(mockTraceError).toHaveBeenCalledWith(expect.any(SchemaExtractionError))
    expect(mockTraceComplete).not.toHaveBeenCalled()
  })

  test('workerData schema accepts omitted and optional projectId', () => {
    const base = {
      configPath: '/studio/sanity.config.ts',
      isExternal: false,
      outPath: 'dist/static',
      schemaRequired: false,
      verbose: false,
      workDir: '/studio',
    }
    expect(buildStudioSchemasAndManifestsWorkerData.parse(base)).toEqual(base)
    expect(
      buildStudioSchemasAndManifestsWorkerData.parse({...base, projectId: 'proj-123'}),
    ).toEqual({
      ...base,
      projectId: 'proj-123',
    })
  })
})
