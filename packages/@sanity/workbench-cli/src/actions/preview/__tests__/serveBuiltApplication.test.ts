import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {serveBuiltApplication} from '../serveBuiltApplication.js'

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
  return serveBuiltApplication({
    cacheDir: '/tmp/.sanity/vite',
    httpHost: 'localhost',
    httpPort: 3334,
    outDir: '/tmp/project/dist',
    workDir: '/tmp/project',
    ...overrides,
  })
}

describe('serveBuiltApplication', () => {
  beforeEach(() => {
    mockCheckBuiltOutput.mockResolvedValue(undefined)
    mockPreview.mockResolvedValue(fakeViteServer())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('propagates a failed build check and never starts the server', async () => {
    // checkBuiltOutput owns the BUILD_NOT_FOUND tagging; this just verifies the
    // error passes through untouched and no server is started.
    const error = Object.assign(new Error('mf-manifest.json does not exist'), {
      name: 'BUILD_NOT_FOUND',
    })
    mockCheckBuiltOutput.mockRejectedValue(error)

    const thrown = await serve().catch((err) => err)

    expect(thrown).toBe(error)
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
