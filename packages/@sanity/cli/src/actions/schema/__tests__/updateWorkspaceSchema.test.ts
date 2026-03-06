import {afterEach, describe, expect, test, vi} from 'vitest'

import {updateWorkspacesSchemas} from '../updateWorkspaceSchema.js'

const mockRequest = vi.fn()

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: (...args: unknown[]) => mockRequest(...args),
    }),
  }
})

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'production',
    name: 'default',
    projectId: 'proj-123',
    schema: {_original: {types: []}},
    title: 'Test Workspace',
    ...overrides,
  } as never
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('updateWorkspacesSchemas', () => {
  test('partial failure throws with counts', async () => {
    // First workspace succeeds, second fails
    mockRequest.mockResolvedValueOnce({ok: true}).mockRejectedValueOnce(new Error('API error'))

    await expect(
      updateWorkspacesSchemas({
        verbose: false,
        workspaces: [
          createWorkspace({dataset: 'production', name: 'ws1'}),
          createWorkspace({dataset: 'staging', name: 'ws2'}),
        ],
      }),
    ).rejects.toThrow('Failed to deploy 1/2 schemas')
  })

  test('401 permission error warns with help text', async () => {
    const permissionError = new Error('Unauthorized') as Error & {statusCode: number}
    permissionError.statusCode = 401
    mockRequest.mockRejectedValue(permissionError)

    const {ux} = await import('@oclif/core/ux')
    const warnSpy = vi.spyOn(ux, 'warn').mockImplementation(() => {})

    await expect(
      updateWorkspacesSchemas({
        verbose: false,
        workspaces: [createWorkspace()],
      }),
    ).rejects.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No permissions to write schema'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SANITY_AUTH_TOKEN'))

    warnSpy.mockRestore()
  })

  test('with tag sends tag in request body', async () => {
    mockRequest.mockResolvedValue({ok: true})

    await updateWorkspacesSchemas({
      tag: 'mytag',
      verbose: false,
      workspaces: [createWorkspace()],
    })

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          schemas: expect.arrayContaining([expect.objectContaining({tag: 'mytag'})]),
        }),
      }),
    )
  })

  test('verbose outputs schemaId, projectId, and dataset', async () => {
    mockRequest.mockResolvedValue({ok: true})

    const {ux} = await import('@oclif/core/ux')
    const stdoutSpy = vi.spyOn(ux, 'stdout').mockImplementation(() => {})

    await updateWorkspacesSchemas({
      verbose: true,
      workspaces: [
        createWorkspace({dataset: 'production', name: 'default', projectId: 'proj-123'}),
      ],
    })

    const calls = stdoutSpy.mock.calls.map((c) => c[0])
    expect(calls.some((c) => typeof c === 'string' && c.includes('proj-123'))).toBe(true)
    expect(calls.some((c) => typeof c === 'string' && c.includes('production'))).toBe(true)
    expect(calls.some((c) => typeof c === 'string' && c.includes('_.schemas.default'))).toBe(true)

    stdoutSpy.mockRestore()
  })
})
