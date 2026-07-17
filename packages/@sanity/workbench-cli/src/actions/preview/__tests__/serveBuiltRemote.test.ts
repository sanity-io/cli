import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {serveBuiltRemote} from '../serveBuiltRemote.js'

const mockCheckBuiltOutput = vi.hoisted(() => vi.fn())
const mockPreview = vi.hoisted(() => vi.fn())

vi.mock('../../deploy/checkBuiltOutput.js', () => ({checkBuiltOutput: mockCheckBuiltOutput}))
vi.mock('vite', () => ({preview: mockPreview}))

function fakeViteServer({port = 3334}: {port?: number} = {}) {
  return {
    httpServer: {
      address: () => ({port}),
      close: (cb: (err?: Error) => void) => cb(),
    },
  }
}

function serve(overrides: Record<string, unknown> = {}) {
  return serveBuiltRemote({
    cacheDir: '/tmp/.sanity/vite',
    httpHost: 'localhost',
    httpPort: 3334,
    outDir: '/tmp/project/dist',
    workDir: '/tmp/project',
    ...overrides,
  })
}

describe('serveBuiltRemote', () => {
  beforeEach(() => {
    mockCheckBuiltOutput.mockResolvedValue(undefined)
    mockPreview.mockResolvedValue(fakeViteServer())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('re-tags a missing build as BUILD_NOT_FOUND so the command can hint at `sanity build`', async () => {
    mockCheckBuiltOutput.mockRejectedValue(new Error('mf-manifest.json does not exist'))

    const thrown = await serve().catch((err) => err)

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.name).toBe('BUILD_NOT_FOUND')
    expect(mockPreview).not.toHaveBeenCalled()
  })

  test('serves the built output at the root and returns the bound address', async () => {
    mockPreview.mockResolvedValue(fakeViteServer({port: 4009}))

    const server = await serve()

    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        base: '/',
        build: {outDir: '/tmp/project/dist'},
        preview: expect.objectContaining({host: 'localhost', port: 3334, strictPort: false}),
        root: '/tmp/project',
      }),
    )
    expect(server).toMatchObject({host: 'localhost', port: 4009})
  })

  test('close shuts the http server down', async () => {
    const server = await serve()
    await expect(server.close()).resolves.toBeUndefined()
  })
})
