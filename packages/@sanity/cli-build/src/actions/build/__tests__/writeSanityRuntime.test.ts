import path from 'node:path'

import * as configMocks from '@sanity/cli-test/mocks/cli-core/config'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getPossibleDocumentComponentLocations} from '../getPossibleDocumentComponentLocations.js'
import {resolveEntries, writeSanityRuntime} from '../writeSanityRuntime.js'

const mockWatch = vi.hoisted(() => vi.fn())
const mockRenderDocument = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: mockWriteFile,
}))
vi.mock('@sanity/cli-core/config', () => import('@sanity/cli-test/mocks/cli-core/config'))
vi.mock('chokidar', () => ({watch: mockWatch}))
vi.mock('../renderDocument.js', () => ({renderDocument: mockRenderDocument}))

const cwd = 'poop'
const runtimeDir = path.join(cwd, 'runtime')
const studioConfigSubPath = path.join('studio', 'config.ts')
const studioConfigPath = path.join(cwd, studioConfigSubPath)

describe('resolveEntries', () => {
  beforeEach(() => {
    configMocks.tryFindStudioConfigPath.mockResolvedValue(studioConfigPath)
  })
  test('should return null relativeEntry when isWorkbenchApp=true and falsy entry', async () => {
    const result = await resolveEntries({cwd, isWorkbenchApp: true, runtimeDir: runtimeDir})
    expect(result.relativeEntry).toBeNull()
  })
  test('should return relativeEntry when isWorkbenchApp=false or truthy entry', async () => {
    let result = await resolveEntries({
      cwd,
      entry: undefined,
      isWorkbenchApp: false,
      runtimeDir: runtimeDir,
    })
    expect(result.relativeEntry).toEqual(path.join('..', 'src', 'App').replaceAll('\\', '/'))
    const entry = path.join('src', 'customAppEntry')
    result = await resolveEntries({
      cwd,
      entry,
      isWorkbenchApp: true,
      runtimeDir: runtimeDir,
    })
    expect(result.relativeEntry).toEqual(path.join('..', entry).replaceAll('\\', '/'))
  })
  test('should return truthy tryFindStudioConfigPath result as relativeConfigLocation when isApp=false', async () => {
    configMocks.tryFindStudioConfigPath.mockResolvedValue(studioConfigPath)
    const result = await resolveEntries({
      cwd,
      isApp: false,
      runtimeDir: runtimeDir,
    })
    expect(result.relativeConfigLocation).toEqual(
      path.join('..', studioConfigSubPath).replaceAll('\\', '/'),
    )
  })
})

describe('writeSanityRuntime', () => {
  // A chainable stand-in for the chokidar FSWatcher: `.on()` returns the watcher
  // so `chokidarWatch(...).on('all', cb)` resolves to it.
  const fakeWatcher = {on: vi.fn().mockReturnThis()}

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
