import {realpathSync} from 'node:fs'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {canonicalizeWatchDir} from '../canonicalizeWatchDir.js'

vi.mock('node:fs', () => ({realpathSync: {native: vi.fn()}}))

describe('canonicalizeWatchDir', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves an existing directory to its canonical real path', () => {
    vi.mocked(realpathSync.native).mockReturnValueOnce('/real/long/path')

    expect(canonicalizeWatchDir('/some/short/path')).toBe('/real/long/path')
    expect(realpathSync.native).toHaveBeenCalledWith('/some/short/path')
  })

  test('falls back to the input path when it cannot be resolved', () => {
    vi.mocked(realpathSync.native).mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })

    expect(canonicalizeWatchDir('/missing')).toBe('/missing')
  })
})
