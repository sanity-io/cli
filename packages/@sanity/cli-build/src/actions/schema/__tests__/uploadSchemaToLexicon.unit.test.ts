import {resolveLocalPackage} from '@sanity/cli-core'
import {spinner, spinnerSucceed, spinnerText} from '@sanity/cli-test/mocks/cli-core/ux'
import {type Workspace} from 'sanity'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {uploadSchemaToLexicon} from '../uploadSchemaToLexicon.js'

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())

const mockUploadSchema = vi.fn()
const mockGenerateStudioManifest = vi.fn()
const mockWithConfig = vi.fn()
const mockGetUrl = vi.fn(() => 'https://proj-123.api.sanity.io/v2025-03-01/')

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getLocalPackageVersion: mockGetLocalPackageVersion,
    getProjectCliClient: vi.fn().mockResolvedValue({
      withConfig: (...args: unknown[]) => mockWithConfig(...args),
    }),
    resolveLocalPackage: vi.fn(),
  }
})

// Mock the icon resolver to avoid React/DOM dependencies
vi.mock('../../manifest/iconResolver.js', () => ({
  resolveIcon: vi.fn().mockResolvedValue(undefined),
}))

const mockResolveLocalPackage = vi.mocked(resolveLocalPackage)

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

afterEach(() => {
  vi.clearAllMocks()
})

describe('uploadSchemaToLexicon', () => {
  test('single workspace success', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockResolveLocalPackage.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
      uploadSchema: mockUploadSchema,
    })
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
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
      projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
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
      projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
    mockUploadSchema.mockResolvedValue('')

    await expect(
      uploadSchemaToLexicon({
        projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
    mockUploadSchema.mockRejectedValue(new Error('Network error'))

    await expect(
      uploadSchemaToLexicon({
        projectId: 'proj-123',
        workDir: '/tmp/test',
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow('Failed to upload schema for workspace')
  })

  test('upload network failure names workspace, host and transport cause', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockResolveLocalPackage.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
      uploadSchema: mockUploadSchema,
    })
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
    const timeoutError = new Error('Connect Timeout Error')
    timeoutError.name = 'ConnectTimeoutError'
    Object.assign(timeoutError, {code: 'UND_ERR_CONNECT_TIMEOUT'})
    const fetchError = new TypeError('fetch failed', {cause: timeoutError})
    mockUploadSchema.mockRejectedValue(fetchError)

    const promise = uploadSchemaToLexicon({
      projectId: 'proj-123',
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    await expect(promise).rejects.toThrow(
      'Failed to upload schema for workspace "default" (project "proj-123", dataset "production") ' +
        'to https://proj-123.api.sanity.io/v2025-03-01: fetch failed ' +
        '(caused by ConnectTimeoutError [UND_ERR_CONNECT_TIMEOUT]: Connect Timeout Error)',
    )
    // The original error must stay attached so cause-aware renderers can walk it
    const error = await promise.catch((err: unknown) => err)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).cause).toBe(fetchError)
    // The failure is reported under the upload phase, with the full detail
    const spin = vi.mocked(spinner).mock.results[0]?.value
    expect(spin.fail).toHaveBeenCalledWith(expect.stringContaining('UND_ERR_CONNECT_TIMEOUT'))
  })

  test('spinner names the upload phase before the manifest generation phase', async () => {
    mockGetLocalPackageVersion.mockResolvedValue('3.0.0')
    mockResolveLocalPackage.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
      uploadSchema: mockUploadSchema,
    })
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
    mockUploadSchema.mockResolvedValue('descriptor-123')
    mockGenerateStudioManifest.mockResolvedValue({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [],
    })

    await uploadSchemaToLexicon({
      projectId: 'proj-123',
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    expect(spinner).toHaveBeenCalledWith('Uploading workspace schemas')
    expect(spinnerText).toHaveBeenCalledWith('Generating studio manifest')
    expect(spinnerSucceed).toHaveBeenCalledWith('Generated studio manifest')
  })

  test('no sanity version throws', async () => {
    mockGetLocalPackageVersion.mockResolvedValue(null)
    mockResolveLocalPackage.mockResolvedValue({
      generateStudioManifest: mockGenerateStudioManifest,
      uploadSchema: mockUploadSchema,
    })

    await expect(
      uploadSchemaToLexicon({
        projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
    mockUploadSchema.mockResolvedValue('descriptor-123')
    mockGenerateStudioManifest.mockResolvedValue({
      buildId: '"123"',
      bundleVersion: '3.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      workspaces: [],
    })

    const result = await uploadSchemaToLexicon({
      projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
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
      projectId: 'proj-123',
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
    mockWithConfig.mockReturnValue({getUrl: mockGetUrl, withConfig: mockWithConfig})
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
      projectId: 'proj-123',
      verbose: true,
      workDir: '/tmp/test',
      workspaces: [createWorkspace()],
    })

    expect(result).toBeNull()
    const calls = stdoutSpy.mock.calls.map((c) => c[0])
    expect(calls.some((c) => typeof c === 'string' && c.includes('No workspaces found'))).toBe(true)

    stdoutSpy.mockRestore()
  })
})
