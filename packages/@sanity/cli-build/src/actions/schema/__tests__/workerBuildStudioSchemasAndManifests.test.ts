import {type StudioManifest, type Workspace} from 'sanity'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type CreateWorkspaceManifest} from '../../manifest/types.js'
import {type BuildStudioSchemasAndManifestsWorkerData} from '../types.js'
import {workerBuildStudioSchemasAndManifests} from '../workerBuildStudioSchemasAndManifests.js'

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

const workspaceManifests = [
  {dataset: 'production', name: 'default'},
  {dataset: 'staging', name: 'staging'},
] as unknown as CreateWorkspaceManifest[]

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

describe('workerBuildStudioSchemasAndManifests', () => {
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
      const workspaceManifestsHandler = vi.fn().mockResolvedValue(undefined)

      const result = await workerBuildStudioSchemasAndManifests({
        ...createOptions({isExternal: false, verbose: true}),
        workspaceManifestsHandler,
      })

      expect(result).toEqual({
        studioManifest,
        type: 'success',
        workspaceManifests,
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
      expect(workspaceManifestsHandler).toHaveBeenCalledWith(workspaceManifests)
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
        studioManifest: null,
        type: 'success',
        workspaceManifests,
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
      const workspaceManifestsHandler = vi.fn().mockRejectedValue(new Error('Handler exploded'))

      await expect(
        workerBuildStudioSchemasAndManifests({
          ...createOptions({isExternal: false}),
          workspaceManifestsHandler,
        }),
      ).rejects.toThrow('Handler exploded')
    })
  })

  describe('external studio', () => {
    test('uploads the schema and calls the handler without writing a manifest file', async () => {
      const workspaceManifestsHandler = vi.fn().mockResolvedValue(undefined)

      const result = await workerBuildStudioSchemasAndManifests({
        ...createOptions({isExternal: true, verbose: true}),
        workspaceManifestsHandler,
      })

      expect(result).toEqual({
        studioManifest,
        type: 'success',
        workspaceManifests,
      })

      expect(mockUploadSchemaToLexicon).toHaveBeenCalledWith({
        projectId: 'proj-123',
        verbose: true,
        workDir: '/studio',
        workspaces,
      })
      expect(workspaceManifestsHandler).toHaveBeenCalledWith(workspaceManifests)
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

    test('propagates failures from the workspace manifests handler', async () => {
      const workspaceManifestsHandler = vi.fn().mockRejectedValue(new Error('Handler exploded'))

      await expect(
        workerBuildStudioSchemasAndManifests({
          ...createOptions({isExternal: true}),
          workspaceManifestsHandler,
        }),
      ).rejects.toThrow('Handler exploded')
    })
  })
})
