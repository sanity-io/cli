import {mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, onTestFinished, test, vi} from 'vitest'

import {serveBuiltApplication} from '../serveBuiltApplication.js'

const mockReadBuiltManifest = vi.hoisted(() => vi.fn())
const mockPreview = vi.hoisted(() => vi.fn())

vi.mock('../../build/readBuiltManifest.js', () => ({readBuiltManifest: mockReadBuiltManifest}))
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
    mockReadBuiltManifest.mockResolvedValue(undefined)
    mockPreview.mockResolvedValue(fakeViteServer())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('propagates a failed build check and never starts the server', async () => {
    // readBuiltManifest owns the BUILD_NOT_FOUND tagging; this just verifies the
    // error passes through untouched and no server is started.
    const error = Object.assign(new Error('mf-manifest.json does not exist'), {
      name: 'BUILD_NOT_FOUND',
    })
    mockReadBuiltManifest.mockRejectedValue(error)

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

  test("serves the app's icon at its path, with its Content-Type, as Dashboard requests it", async () => {
    const {preview} = await vi.importActual<typeof import('vite')>('vite')
    mockPreview.mockImplementationOnce(preview)
    const workDir = await mkdtemp(join(tmpdir(), 'preview-icon-'))
    onTestFinished(() => rm(workDir, {force: true, recursive: true}))
    await mkdir(join(workDir, 'dist'))
    const image = Buffer.from('png bytes')

    const server = await serve({
      cacheDir: join(workDir, '.sanity/vite'),
      httpPort: 0,
      icon: {contentType: 'image/png', image, path: '/public/icon.png'},
      outDir: join(workDir, 'dist'),
      workDir,
    })
    onTestFinished(() => server.close())
    const response = await fetch(
      `http://localhost:${server.port}/public/icon.png?w=16&h=16&fit=crop&auto=format&dpr=2`,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(image)
  })

  test('close shuts the http server down', async () => {
    const server = await serve()
    await expect(server.close()).resolves.toBeUndefined()
  })
})
