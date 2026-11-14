import {resolveLocalPackage} from '@sanity/cli-core'
import {type Workspace} from 'sanity'
import {afterEach, beforeEach, describe, expect, Mock, test, vi} from 'vitest'

import {uploadSchemaToLexicon} from '../uploadSchemaToLexicon.js'

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockPrepareSchemaUpload = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

let mockUploadSchema: Mock
let mockGenerateStudioManifest: Mock
let mockWithConfig: Mock
let mockGlobalRequest: Mock

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalCliClient: mockGetGlobalCliClient,
    getLocalPackageVersion: mockGetLocalPackageVersion,
    getProjectCliClient: mockGetProjectCliClient,
    resolveLocalPackage: vi.fn(),
  }
})
vi.mock(import('@sanity/schema/_internal'), () => ({
  prepareSchemaUpload: mockPrepareSchemaUpload,
}))

// Mock the icon resolver to avoid React/DOM dependencies
vi.mock('../../manifest/iconResolver.js', () => ({
  resolveIcon: vi.fn().mockResolvedValue(undefined),
}))

const mockResolveLocalPackage = vi.mocked(resolveLocalPackage)

const listeners = {
  onGenerateManifestDone: vi.fn(),
  onGenerateManifestFail: vi.fn(),
  onGenerateManifestStart: vi.fn(),
}

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'production',
    name: 'default',
    projectId: 'proj-123',
    schema: {_original: {types: []}},
    title: 'Test Workspace',
    ...overrides,
  } as unknown as Workspace
}

describe('uploadSchemaToLexicon', () => {
  beforeEach(() => {
    mockUploadSchema = vi.fn()
    mockGenerateStudioManifest = vi.fn()
    mockWithConfig = vi.fn()
    mockGlobalRequest = vi.fn()

    mockGetProjectCliClient.mockResolvedValue({
      withConfig: (...args: unknown[]) => mockWithConfig(...args),
    })
    mockGetGlobalCliClient.mockResolvedValue({
      request: (...args: unknown[]) => mockGlobalRequest(...args),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('sanitySchemaToLexicon', () => {
    test('single workspace success', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'proj-123',
            schemaDescriptorId: 'descriptor-123',
            title: 'Test Workspace',
          },
        ],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).not.toBeNull()
      expect(result?.workspaces).toHaveLength(1)
      expect(mockPrepareSchemaUpload).toHaveBeenCalledTimes(1)
      expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-06-01',
        requireUser: true,
      })
    })

    test('requests go through the global client and commit is called', async () => {
      const mockCommit = vi.fn().mockResolvedValue(undefined)
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockGlobalRequest.mockResolvedValue({ok: true})
      mockPrepareSchemaUpload.mockImplementation(async (_schema, options) => {
        await options.requester({
          body: '{"foo":"bar"}',
          headers: {'Content-Type': 'application/json'},
          method: 'POST',
          url: '/v2025-06-01/descriptors/upload',
        })
        return {commit: mockCommit, descriptorId: 'descriptor-123'}
      })
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'proj-123',
            schemaDescriptorId: 'descriptor-123',
            title: 'Test Workspace',
          },
        ],
      })

      await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(mockPrepareSchemaUpload).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          apiVersion: 'v2025-06-01',
          claim: 'temporary',
          contextKey: 'dataset:proj-123:production',
        }),
      )
      expect(mockGlobalRequest).toHaveBeenCalledWith({
        body: '{"foo":"bar"}',
        headers: {'content-type': 'application/json'},
        method: 'POST',
        url: '/descriptors/upload',
      })
      expect(mockCommit).toHaveBeenCalledTimes(1)
    })

    test('multiple workspaces', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload
        .mockResolvedValueOnce({descriptorId: 'descriptor-1'})
        .mockResolvedValueOnce({descriptorId: 'descriptor-2'})
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'ws1',
            projectId: 'proj-1',
            schemaDescriptorId: 'descriptor-1',
            title: 'WS1',
          },
          {
            basePath: '/',
            dataset: 'staging',
            name: 'ws2',
            projectId: 'proj-2',
            schemaDescriptorId: 'descriptor-2',
            title: 'WS2',
          },
        ],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        workDir: '/tmp/test',
        workspaces: [
          createWorkspace({dataset: 'production', name: 'ws1', projectId: 'proj-1'}),
          createWorkspace({dataset: 'staging', name: 'ws2', projectId: 'proj-2'}),
        ],
      })

      expect(result?.workspaces).toHaveLength(2)
      expect(mockPrepareSchemaUpload).toHaveBeenCalledTimes(2)
    })

    test('upload throws', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        uploadSchemaToLexicon({
          ...listeners,
          claimType: 'temporary',
          scope: 'global',
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('Failed to upload schema for workspace')
    })

    test('no sanity version throws', async () => {
      mockGetLocalPackageVersion.mockResolvedValue(null)
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })

      await expect(
        uploadSchemaToLexicon({
          ...listeners,
          claimType: 'temporary',
          scope: 'global',
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('Failed to find sanity version')
    })

    test('empty workspaces in manifest returns null', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      } as unknown)
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).toBeNull()
    })

    test('verbose output includes workspace details', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'proj-123',
            schemaDescriptorId: 'descriptor-123',
            title: 'Test',
          },
        ],
      })

      const {ux} = await import('@oclif/core/ux')
      const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

      const result = await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        verbose: true,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).not.toBeNull()
      const calls = stdoutSpy.mock.calls.map((c) => c[0])
      expect(calls.some((c) => typeof c === 'string' && c.includes('proj-123'))).toBe(true)
      expect(calls.some((c) => typeof c === 'string' && c.includes('descriptor-123'))).toBe(true)

      stdoutSpy.mockRestore()
    })

    test('verbose with null manifest outputs no workspaces message', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockResolvedValueOnce({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [],
      })

      const {ux} = await import('@oclif/core/ux')
      const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

      const result = await uploadSchemaToLexicon({
        ...listeners,
        claimType: 'temporary',
        scope: 'global',
        verbose: true,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).toBeNull()
      const calls = stdoutSpy.mock.calls.map((c) => c[0])
      expect(calls.some((c) => typeof c === 'string' && c.includes('No workspaces found'))).toBe(
        true,
      )

      stdoutSpy.mockRestore()
    })
  })

  describe('clientUploadToLexicon', () => {
    test('single workspace success', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValue('descriptor-123')
      mockGenerateStudioManifest.mockResolvedValue({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'proj-123',
            schemaDescriptorId: 'descriptor-123',
            title: 'Test Workspace',
          },
        ],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        projectId: 'proj-123',
        scope: 'project',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).not.toBeNull()
      expect(result?.workspaces).toHaveLength(1)
      expect(mockUploadSchema).toHaveBeenCalledTimes(1)
    })

    test('multiple workspaces', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValueOnce('descriptor-1').mockResolvedValueOnce('descriptor-2')
      mockGenerateStudioManifest.mockResolvedValue({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'ws1',
            projectId: 'proj-1',
            schemaDescriptorId: 'descriptor-1',
            title: 'WS1',
          },
          {
            basePath: '/',
            dataset: 'staging',
            name: 'ws2',
            projectId: 'proj-2',
            schemaDescriptorId: 'descriptor-2',
            title: 'WS2',
          },
        ],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        projectId: 'proj-123',
        scope: 'project',
        workDir: '/tmp/test',
        workspaces: [
          createWorkspace({dataset: 'production', name: 'ws1', projectId: 'proj-1'}),
          createWorkspace({dataset: 'staging', name: 'ws2', projectId: 'proj-2'}),
        ],
      })

      expect(result?.workspaces).toHaveLength(2)
      expect(mockUploadSchema).toHaveBeenCalledTimes(2)
      expect(mockWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'production', projectId: 'proj-1'}),
      )
      expect(mockWithConfig).toHaveBeenCalledWith(
        expect.objectContaining({dataset: 'staging', projectId: 'proj-2'}),
      )
    })

    test('empty descriptorId throws', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValue('')

      await expect(
        uploadSchemaToLexicon({
          ...listeners,
          projectId: 'proj-123',
          scope: 'project',
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('Failed to upload schema for workspace')
    })

    test('upload throws', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockRejectedValue(new Error('Network error'))

      await expect(
        uploadSchemaToLexicon({
          ...listeners,
          projectId: 'proj-123',
          scope: 'project',
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('Failed to upload schema for workspace')
    })

    test('no sanity version throws', async () => {
      mockGetLocalPackageVersion.mockResolvedValue(null)
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })

      await expect(
        uploadSchemaToLexicon({
          ...listeners,
          projectId: 'proj-123',
          scope: 'project',
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('Failed to find sanity version')
    })

    test('empty workspaces in manifest returns null', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      } as unknown)
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValue('descriptor-123')
      mockGenerateStudioManifest.mockResolvedValue({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [],
      })

      const result = await uploadSchemaToLexicon({
        ...listeners,
        projectId: 'proj-123',
        scope: 'project',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).toBeNull()
    })

    test('verbose output includes workspace details', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValue('descriptor-123')
      mockGenerateStudioManifest.mockResolvedValue({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'proj-123',
            schemaDescriptorId: 'descriptor-123',
            title: 'Test',
          },
        ],
      })

      const {ux} = await import('@oclif/core/ux')
      const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

      const result = await uploadSchemaToLexicon({
        ...listeners,
        projectId: 'proj-123',
        scope: 'project',
        verbose: true,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).not.toBeNull()
      const calls = stdoutSpy.mock.calls.map((c) => c[0])
      expect(calls.some((c) => typeof c === 'string' && c.includes('proj-123'))).toBe(true)
      expect(calls.some((c) => typeof c === 'string' && c.includes('descriptor-123'))).toBe(true)

      stdoutSpy.mockRestore()
    })

    test('verbose with null manifest outputs no workspaces message', async () => {
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockResolveLocalPackage.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
        uploadSchema: mockUploadSchema,
      })
      mockWithConfig.mockReturnValue({withConfig: mockWithConfig})
      mockUploadSchema.mockResolvedValue('descriptor-123')
      mockGenerateStudioManifest.mockResolvedValue({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        workspaces: [],
      })

      const {ux} = await import('@oclif/core/ux')
      const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

      const result = await uploadSchemaToLexicon({
        ...listeners,
        projectId: 'proj-123',
        scope: 'project',
        verbose: true,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(result).toBeNull()
      const calls = stdoutSpy.mock.calls.map((c) => c[0])
      expect(calls.some((c) => typeof c === 'string' && c.includes('No workspaces found'))).toBe(
        true,
      )

      stdoutSpy.mockRestore()
    })
  })
})
