import {type StudioManifest, type Workspace} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type CreateWorkspaceManifest} from '../../manifest/types.js'
import {workerBuildStudioSchemasAndManifests} from '../buildStudioSchemasAndManifestsWorker.js'
import {type BuildStudioSchemasAndManifestsWorkerData} from '../types.js'

// Mutable so individual tests can flip which thread the module under test believes it is on
const mockIsMainThread = vi.hoisted(() => ({value: false}))
const mockGetStudioWorkspaces = vi.hoisted(() => vi.fn())
const mockExtractWorkspaceManifest = vi.hoisted(() => vi.fn())
const mockWriteManifestFile = vi.hoisted(() => vi.fn())
const mockUploadSchemaToLexicon = vi.hoisted(() => vi.fn())

vi.mock('node:worker_threads', () => ({
  get isMainThread() {
    return mockIsMainThread.value
  },
}))

vi.mock('@sanity/cli-core', () => ({
  getStudioWorkspaces: mockGetStudioWorkspaces,
  subdebug: () => vi.fn(),
}))

vi.mock(import('../../manifest/extractWorkspaceManifest.js'), () => ({
  extractWorkspaceManifest: mockExtractWorkspaceManifest,
}))

vi.mock(import('../../manifest/writeManifestFile.js'), () => ({
  writeManifestFile: mockWriteManifestFile,
}))

vi.mock(import('../uploadSchemaToLexicon.js'), () => ({
  uploadSchemaToLexicon: mockUploadSchemaToLexicon,
}))

const workspaces = [{name: 'default'}, {name: 'staging'}] as unknown as Workspace[]

const workspaceManifests: CreateWorkspaceManifest[] = [
  {
    basePath: '/',
    dataset: 'production',
    icon: 'favicon.ico',
    name: 'default',
    projectId: 'proj1234',
    schema: [],
    tools: [],
  },
  {
    basePath: '/',
    dataset: 'staging',
    icon: 'favicon.ico',
    name: 'staging',
    projectId: 'proj1234',
    schema: [],
    tools: [],
  },
]

const studioManifest: StudioManifest = {
  buildId: '12345',
  bundleVersion: '3.0.0',
  version: '2.0.0',
  workspaces: [],
}

function createOptions(
  overrides: Partial<BuildStudioSchemasAndManifestsWorkerData> = {},
): BuildStudioSchemasAndManifestsWorkerData {
  return {
    configPath: '/studio/sanity.config.ts',
    isExternal: false,
    outPath: 'dist/static',
    projectId: 'proj-123',
    schemaRequired: false,
    verbose: false,
    workDir: '/studio',
    ...overrides,
  }
}

beforeEach(() => {
  mockIsMainThread.value = false
  mockGetStudioWorkspaces.mockResolvedValue(workspaces)
  mockExtractWorkspaceManifest.mockResolvedValue(workspaceManifests)
  mockWriteManifestFile.mockResolvedValue(undefined)
  mockUploadSchemaToLexicon.mockResolvedValue(studioManifest)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('buildStudioSchemasAndManifestsWorker', () => {
  test('throws when called from the main thread', async () => {
    mockIsMainThread.value = true

    await expect(workerBuildStudioSchemasAndManifests(createOptions())).rejects.toThrow(
      'workerBuildStudioSchemasAndManifests should only be called from a worker thread',
    )

    expect(mockGetStudioWorkspaces).not.toHaveBeenCalled()
    expect(mockExtractWorkspaceManifest).not.toHaveBeenCalled()
  })

  test('throws when the studio config resolves no workspaces', async () => {
    mockGetStudioWorkspaces.mockResolvedValue([])

    await expect(workerBuildStudioSchemasAndManifests(createOptions())).rejects.toThrow(
      'No workspaces found',
    )

    expect(mockGetStudioWorkspaces).toHaveBeenCalledWith('/studio/sanity.config.ts')
    expect(mockExtractWorkspaceManifest).not.toHaveBeenCalled()
    expect(mockUploadSchemaToLexicon).not.toHaveBeenCalled()
    expect(mockWriteManifestFile).not.toHaveBeenCalled()
  })

  test('propagates failures from workspace resolution', async () => {
    mockGetStudioWorkspaces.mockRejectedValue(new Error('Invalid studio config'))

    await expect(workerBuildStudioSchemasAndManifests(createOptions())).rejects.toThrow(
      'Invalid studio config',
    )

    expect(mockExtractWorkspaceManifest).not.toHaveBeenCalled()
  })

  test('propagates failures from manifest extraction', async () => {
    mockExtractWorkspaceManifest.mockRejectedValue(new Error('Unserializable schema type'))

    await expect(workerBuildStudioSchemasAndManifests(createOptions())).rejects.toThrow(
      'Unserializable schema type',
    )

    expect(mockUploadSchemaToLexicon).not.toHaveBeenCalled()
    expect(mockWriteManifestFile).not.toHaveBeenCalled()
  })

  describe('internal studio', () => {
    test('writes the manifest file, uploads the schema and returns the result', async () => {
      const workspaceSchemaHandler = vi.fn().mockResolvedValue(undefined)

      const result = await workerBuildStudioSchemasAndManifests({
        ...createOptions({isExternal: false, verbose: true}),
        workspaceSchemaHandler,
      })

      expect(result).toEqual({
        schemaInputs: expect.objectContaining(result.schemaInputs),
        studioManifest,
        type: 'success',
      })

      expect(mockExtractWorkspaceManifest).toHaveBeenCalledWith(workspaces, '/studio')
      expect(mockUploadSchemaToLexicon).toHaveBeenCalledWith({
        projectId: 'proj-123',
        verbose: true,
        workDir: '/studio',
        workspaces,
      })
      expect(mockWriteManifestFile).toHaveBeenCalledWith({
        outPath: 'dist/static',
        workDir: '/studio',
        workspaceManifests,
      })
      expect(workspaceSchemaHandler).toHaveBeenCalledWith(result.schemaInputs)
    })

    test('skips the handler when none is provided', async () => {
      const result = await workerBuildStudioSchemasAndManifests(createOptions({isExternal: false}))

      expect(result.type).toBe('success')
      expect(mockWriteManifestFile).toHaveBeenCalledTimes(1)
      expect(mockUploadSchemaToLexicon).toHaveBeenCalledTimes(1)
    })

    test('returns a null studio manifest when nothing was uploaded', async () => {
      mockUploadSchemaToLexicon.mockResolvedValue(null)

      const result = await workerBuildStudioSchemasAndManifests(createOptions({isExternal: false}))

      expect(result).toEqual({
        schemaInputs: expect.objectContaining(result.schemaInputs),
        studioManifest: null,
        type: 'success',
      })
    })

    test('propagates failures from writing the manifest file', async () => {
      mockWriteManifestFile.mockRejectedValue(new Error('EACCES: permission denied'))

      await expect(
        workerBuildStudioSchemasAndManifests(createOptions({isExternal: false})),
      ).rejects.toThrow('EACCES: permission denied')
    })

    test('propagates failures from the schema upload', async () => {
      mockUploadSchemaToLexicon.mockRejectedValue(new Error('Failed to upload schema'))

      await expect(
        workerBuildStudioSchemasAndManifests(createOptions({isExternal: false})),
      ).rejects.toThrow('Failed to upload schema')
    })

    test('propagates failures from the workspace manifests handler', async () => {
      const workspaceSchemaHandler = vi.fn().mockRejectedValue(new Error('Handler exploded'))

      await expect(
        workerBuildStudioSchemasAndManifests({
          ...createOptions({isExternal: false}),
          workspaceSchemaHandler,
        }),
      ).rejects.toThrow('Handler exploded')
    })
  })

  describe('external studio', () => {
    test('uploads the schema and calls the handler without writing a manifest file', async () => {
      const workspaceSchemaHandler = vi.fn().mockResolvedValue(undefined)

      const result = await workerBuildStudioSchemasAndManifests({
        ...createOptions({isExternal: true, verbose: true}),
        workspaceSchemaHandler,
      })

      expect(result).toEqual({
        schemaInputs: null,
        studioManifest,
        type: 'success',
      })

      expect(mockUploadSchemaToLexicon).toHaveBeenCalledWith({
        projectId: 'proj-123',
        verbose: true,
        workDir: '/studio',
        workspaces,
      })
      expect(workspaceSchemaHandler).not.toHaveBeenCalled()
      expect(mockWriteManifestFile).not.toHaveBeenCalled()
    })

    test('skips the handler when none is provided', async () => {
      const result = await workerBuildStudioSchemasAndManifests(createOptions({isExternal: true}))

      expect(result.type).toBe('success')
      expect(mockUploadSchemaToLexicon).toHaveBeenCalledTimes(1)
      expect(mockWriteManifestFile).not.toHaveBeenCalled()
    })

    test('returns a null studio manifest when nothing was uploaded', async () => {
      mockUploadSchemaToLexicon.mockResolvedValue(null)

      const result = await workerBuildStudioSchemasAndManifests(createOptions({isExternal: true}))

      expect(result.studioManifest).toBeNull()
    })

    test('propagates failures from the schema upload', async () => {
      mockUploadSchemaToLexicon.mockRejectedValue(new Error('Failed to upload schema'))

      await expect(
        workerBuildStudioSchemasAndManifests(createOptions({isExternal: true})),
      ).rejects.toThrow('Failed to upload schema')
    })
  })
})
