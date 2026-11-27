import {getGlobalCliClient, loadStudioCliTooling} from '@sanity/cli-core'
import {prepareSchemaUpload} from '@sanity/schema/_internal'
import {type Workspace} from 'sanity'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {uploadSchemaToLexicon} from '../uploadSchemaToLexicon.js'

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())
const mockResolveIcon = vi.hoisted(() => vi.fn())
const mockPrepareSchemaUpload = vi.hoisted(() => vi.fn())

const mockGenerateStudioManifest = vi.fn()

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockRequest,
    }),
    getLocalPackageVersion: mockGetLocalPackageVersion,
    loadStudioCliTooling: vi.fn(),
  }
})

vi.mock('@sanity/schema/_internal', () => ({
  prepareSchemaUpload: mockPrepareSchemaUpload,
}))

// Mock the icon resolver to avoid React/DOM dependencies
vi.mock('../../manifest/iconResolver.js', () => ({
  resolveIcon: mockResolveIcon,
}))

const mockGetGlobalCliClient = vi.mocked(getGlobalCliClient)
const mockLoadStudioCliTooling = vi.mocked(loadStudioCliTooling)

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

function createListeners() {
  return {
    onGenerateManifestDone: vi.fn(),
    onGenerateManifestFail: vi.fn(),
    onGenerateManifestStart: vi.fn(),
  }
}

afterEach(() => {
  vi.clearAllMocks()
  mockGetGlobalCliClient.mockResolvedValue({request: mockRequest} as never)
  mockResolveIcon.mockResolvedValue(undefined)
})

describe('uploadSchemaToLexicon', () => {
  test('uploads single workspace schema via global client with temporary claim', async () => {
    const workspace = createWorkspace()
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
    mockResolveIcon.mockResolvedValue('<svg />')
    mockGenerateStudioManifest.mockImplementation(
      async ({resolveIcon, resolveSchemaDescriptorId, workspaces}) => ({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        workspaces: await Promise.all(
          workspaces.map(async (ws: Workspace) => ({
            basePath: '/',
            dataset: ws.dataset,
            icon: await resolveIcon(ws),
            name: ws.name,
            projectId: ws.projectId,
            schemaDescriptorId: await resolveSchemaDescriptorId(ws),
            title: ws.title,
          })),
        ),
      }),
    )

    const result = await uploadSchemaToLexicon({
      workDir: '/tmp/test',
      workspaces: [workspace],
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith({
      apiVersion: 'v2025-06-01',
      requestTagPrefix: 'sanity.cli.deploy',
      requireUser: true,
    })
    expect(mockPrepareSchemaUpload).toHaveBeenCalledTimes(1)
    expect(mockPrepareSchemaUpload).toHaveBeenCalledWith(workspace.schema, {
      apiVersion: 'v2025-06-01',
      claim: 'temporary',
      contextKey: 'dataset:proj-123:production',
      requester: expect.any(Function),
    })
    expect(result).toEqual({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      workspaces: [
        {
          basePath: '/',
          dataset: 'production',
          icon: '<svg />',
          name: 'default',
          projectId: 'proj-123',
          schemaDescriptorId: 'descriptor-123',
          title: 'Test Workspace',
        },
      ],
    })
  })

  test('requester strips leading version prefix and forwards options to global client', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockRequest.mockResolvedValue({ok: true})
    mockPrepareSchemaUpload.mockImplementation(async (_schema, options) => {
      const controller = new AbortController()
      await options.requester({
        body: {descriptorId: 'desc-1'},
        headers: {'X-Custom': 'value'},
        method: 'POST',
        signal: controller.signal,
        url: '/v2025-06-01/descriptors/claim',
      })
      await options.requester({
        method: 'GET',
        url: '/descriptors/other',
      })
      return {descriptorId: 'descriptor-123'}
    })
    mockGenerateStudioManifest.mockResolvedValue({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      workspaces: [
        {
          dataset: 'production',
          name: 'default',
          projectId: 'proj-123',
          schemaDescriptorId: 'descriptor-123',
        },
      ],
    })

    await uploadSchemaToLexicon({
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      body: {descriptorId: 'desc-1'},
      headers: {'x-custom': 'value'},
      method: 'POST',
      signal: expect.any(AbortSignal),
      url: '/descriptors/claim',
    })
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      body: undefined,
      headers: undefined,
      method: 'GET',
      signal: undefined,
      url: '/descriptors/other',
    })
    expect(vi.mocked(prepareSchemaUpload)).toHaveBeenCalledTimes(1)
  })

  test('multiple workspaces share global client and scope contextKey per workspace', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload
      .mockResolvedValueOnce({descriptorId: 'descriptor-1'})
      .mockResolvedValueOnce({descriptorId: 'descriptor-2'})
    mockResolveIcon.mockResolvedValue(null)
    mockGenerateStudioManifest.mockImplementation(
      async ({resolveIcon, resolveSchemaDescriptorId, workspaces}) => ({
        buildId: '"123"',
        bundleVersion: '3.0.0',
        workspaces: await Promise.all(
          workspaces.map(async (ws: Workspace) => ({
            dataset: ws.dataset,
            icon: await resolveIcon(ws),
            name: ws.name,
            projectId: ws.projectId,
            schemaDescriptorId: await resolveSchemaDescriptorId(ws),
          })),
        ),
      }),
    )

    const result = await uploadSchemaToLexicon({
      workDir: '/tmp/test',
      workspaces: [
        createWorkspace({dataset: 'production', name: 'ws1', projectId: 'proj-1', title: ''}),
        createWorkspace({dataset: 'staging', name: '', projectId: 'proj-2', title: ''}),
      ],
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledTimes(1)
    expect(result?.workspaces).toHaveLength(2)
    expect(mockPrepareSchemaUpload).toHaveBeenCalledTimes(2)
    expect(mockPrepareSchemaUpload).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({contextKey: 'dataset:proj-1:production'}),
    )
    expect(mockPrepareSchemaUpload).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({contextKey: 'dataset:proj-2:staging'}),
    )
    expect(mockResolveIcon).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({title: 'ws1', workDir: '/tmp/test'}),
    )
    expect(mockResolveIcon).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({title: 'default', workDir: '/tmp/test'}),
    )
    expect(result?.workspaces[0]?.icon).toBeUndefined()
  })

  test('empty descriptorId throws', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockResolvedValue({descriptorId: ''})

    await expect(
      uploadSchemaToLexicon({
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow('Failed to upload schema for workspace')
  })

  test('upload throws Error', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockRejectedValue(new Error('Network error'))

    await expect(
      uploadSchemaToLexicon({
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow('Failed to upload schema for workspace "default": Network error')
  })

  test('upload throws non-Error value', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockRejectedValue('boom')

    await expect(
      uploadSchemaToLexicon({
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow('Failed to upload schema for workspace "default": Unknown error')
  })

  test('outer non-Error rejection is rethrown as-is', async () => {
    mockGetGlobalCliClient.mockRejectedValueOnce('auth failure')

    await expect(
      uploadSchemaToLexicon({
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toBe('auth failure')
  })

  test('no sanity version throws', async () => {
    mockGetLocalPackageVersion.mockResolvedValue(null)
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)

    await expect(
      uploadSchemaToLexicon({
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow('Failed to find sanity version')
  })

  test('empty workspaces in manifest returns null', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
    mockGenerateStudioManifest.mockResolvedValue({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [],
    })

    const result = await uploadSchemaToLexicon({
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    expect(result).toBeNull()
  })

  test('verbose output includes workspace details', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
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
    mockLoadStudioCliTooling.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
    } as never)
    mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
    mockGenerateStudioManifest.mockResolvedValue({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [],
    })

    const {ux} = await import('@oclif/core/ux')
    const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

    const result = await uploadSchemaToLexicon({
      verbose: true,
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    expect(result).toBeNull()
    const calls = stdoutSpy.mock.calls.map((c) => c[0])
    expect(calls.some((c) => typeof c === 'string' && c.includes('No workspaces found'))).toBe(true)

    stdoutSpy.mockRestore()
  })

  describe('listeners', () => {
    test('calls start then done on success', async () => {
      const listeners = createListeners()
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockLoadStudioCliTooling.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
      } as never)
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockImplementation(async () => {
        // The manifest is generated after start and before done
        expect(listeners.onGenerateManifestStart).toHaveBeenCalledTimes(1)
        expect(listeners.onGenerateManifestDone).not.toHaveBeenCalled()
        return {buildId: '"123"', bundleVersion: '3.0.0', workspaces: []}
      })

      await uploadSchemaToLexicon({
        listeners,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      })

      expect(listeners.onGenerateManifestStart).toHaveBeenCalledTimes(1)
      expect(listeners.onGenerateManifestStart).toHaveBeenCalledWith()
      expect(listeners.onGenerateManifestDone).toHaveBeenCalledTimes(1)
      expect(listeners.onGenerateManifestDone).toHaveBeenCalledWith()
      expect(listeners.onGenerateManifestFail).not.toHaveBeenCalled()
    })

    test('calls start before any work is done', async () => {
      const listeners = createListeners()
      mockGetGlobalCliClient.mockImplementationOnce(async () => {
        expect(listeners.onGenerateManifestStart).toHaveBeenCalledTimes(1)
        throw new Error('auth failure')
      })

      await expect(
        uploadSchemaToLexicon({
          listeners,
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toThrow('auth failure')
    })

    test('calls fail with the thrown error when the schema upload fails', async () => {
      const listeners = createListeners()
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockLoadStudioCliTooling.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
      } as never)
      mockPrepareSchemaUpload.mockRejectedValue(new Error('Network error'))

      const error = await uploadSchemaToLexicon({
        listeners,
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }).catch((err: unknown) => err)

      expect(error).toBeInstanceOf(Error)
      expect(listeners.onGenerateManifestStart).toHaveBeenCalledTimes(1)
      expect(listeners.onGenerateManifestFail).toHaveBeenCalledTimes(1)
      expect(listeners.onGenerateManifestFail).toHaveBeenCalledWith(error)
      expect(listeners.onGenerateManifestDone).not.toHaveBeenCalled()
    })

    test('calls fail when manifest generation fails', async () => {
      const listeners = createListeners()
      const failure = new Error('Manifest generation failed')
      mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
      mockLoadStudioCliTooling.mockResolvedValue({
        generateStudioManifest: mockGenerateStudioManifest,
      } as never)
      mockPrepareSchemaUpload.mockResolvedValue({descriptorId: 'descriptor-123'})
      mockGenerateStudioManifest.mockRejectedValue(failure)

      await expect(
        uploadSchemaToLexicon({
          listeners,
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toBe(failure)

      expect(listeners.onGenerateManifestFail).toHaveBeenCalledWith(failure)
      expect(listeners.onGenerateManifestDone).not.toHaveBeenCalled()
    })

    test('passes non-Error rejections to fail as-is', async () => {
      const listeners = createListeners()
      mockGetGlobalCliClient.mockRejectedValueOnce('auth failure')

      await expect(
        uploadSchemaToLexicon({
          listeners,
          workDir: '/tmp/test',
          workspaces: [createWorkspace()],
        }),
      ).rejects.toBe('auth failure')

      expect(listeners.onGenerateManifestStart).toHaveBeenCalledTimes(1)
      expect(listeners.onGenerateManifestFail).toHaveBeenCalledWith('auth failure')
      expect(listeners.onGenerateManifestDone).not.toHaveBeenCalled()
    })
  })
})
