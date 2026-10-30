import {SchemaExtractionError} from '@sanity/cli-build/_internal/extract'
import {studioWorkerTask} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {createMockOutput} from '../../dev/__tests__/testHelpers.js'
import {deployStudioSchemasAndManifests} from '../deployStudioSchemasAndManifests.js'
import {type DeployStudioSchemasAndManifestsWorkerData} from '../types.js'

const mockTrace = vi.hoisted(() => ({
  complete: vi.fn(),
  error: vi.fn(),
  start: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliTelemetry: vi.fn(() => ({trace: vi.fn(() => mockTrace)})),
  studioWorkerTask: vi.fn(),
}))

const mockStudioWorkerTask = vi.mocked(studioWorkerTask)

function workerOptions(): DeployStudioSchemasAndManifestsWorkerData {
  return {
    configPath: '/root/sanity.cli.ts',
    isExternal: false,
    outPath: '/root/dist/static',
    projectId: 'proj-123',
    schemaRequired: false,
    verbose: false,
    workDir: '/root',
  }
}

describe('deployStudioSchemasAndManifests', () => {
  test('returns the studio manifest on success', async () => {
    const studioManifest = {workspaces: []}
    mockStudioWorkerTask.mockResolvedValue({studioManifest, type: 'success'})

    await expect(
      deployStudioSchemasAndManifests(workerOptions(), createMockOutput()),
    ).resolves.toBe(studioManifest)
  })

  test('rebuilds the serialized cause chain from a worker error', async () => {
    mockStudioWorkerTask.mockResolvedValue({
      causes: [
        {message: 'fetch failed', name: 'TypeError'},
        {code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 1.2.3.4:443', name: 'Error'},
      ],
      error: 'Failed to upload schema for workspace "default"',
      type: 'error',
    })

    const promise = deployStudioSchemasAndManifests(workerOptions(), createMockOutput())

    await expect(promise).rejects.toThrow(SchemaExtractionError)
    const error = (await promise.catch((err: unknown) => err)) as SchemaExtractionError
    expect(error.message).toBe('Failed to upload schema for workspace "default"')
    const fetchCause = error.cause as Error
    expect(fetchCause.message).toBe('fetch failed')
    const transportCause = fetchCause.cause as Error & {code?: string}
    expect(transportCause.code).toBe('ETIMEDOUT')
  })

  test('throws a plain SchemaExtractionError when the worker sends no causes', async () => {
    const validation = [{path: [], problems: []}]
    mockStudioWorkerTask.mockResolvedValue({
      error: 'No workspaces found',
      type: 'error',
      validation,
    })

    const error = (await deployStudioSchemasAndManifests(workerOptions(), createMockOutput()).catch(
      (err: unknown) => err,
    )) as SchemaExtractionError
    expect(error).toBeInstanceOf(SchemaExtractionError)
    expect(error.cause).toBeUndefined()
    expect(error.validation).toBe(validation)
  })
})
