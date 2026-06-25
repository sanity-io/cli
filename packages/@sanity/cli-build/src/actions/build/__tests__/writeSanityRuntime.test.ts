import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

const mockWatch = vi.hoisted(() => vi.fn())
const mockRenderDocument = vi.hoisted(() => vi.fn())

vi.mock('chokidar', () => ({watch: mockWatch}))
vi.mock('../renderDocument.js', () => ({renderDocument: mockRenderDocument}))

const {writeSanityRuntime} = await import('../writeSanityRuntime.js')
const {getPossibleDocumentComponentLocations} =
  await import('../getPossibleDocumentComponentLocations.js')

describe('writeSanityRuntime watch mode', () => {
  // A chainable stand-in for the chokidar FSWatcher: `.on()` returns the watcher
  // so `chokidarWatch(...).on('all', cb)` resolves to it.
  const fakeWatcher = {on: vi.fn().mockReturnThis()}
  let cwd: string

  beforeAll(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-runtime-'))
  })

  afterAll(async () => {
    await fs.rm(cwd, {force: true, recursive: true})
  })

  beforeEach(() => {
    mockWatch.mockReturnValue(fakeWatcher)
    mockRenderDocument.mockResolvedValue('<html><head></head><body></body></html>')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('passes ignoreInitial so the initial scan does not double-render', async () => {
    const {watcher} = await writeSanityRuntime({
      cwd,
      isApp: true,
      reactStrictMode: false,
      watch: true,
    })

    expect(mockWatch).toHaveBeenCalledWith(getPossibleDocumentComponentLocations(cwd), {
      ignoreInitial: true,
    })
    expect(watcher).toBe(fakeWatcher)
  })

  test('creates no watcher when watch is disabled', async () => {
    const {watcher} = await writeSanityRuntime({
      cwd,
      isApp: true,
      reactStrictMode: false,
      watch: false,
    })

    expect(mockWatch).not.toHaveBeenCalled()
    expect(watcher).toBeUndefined()
  })
})
