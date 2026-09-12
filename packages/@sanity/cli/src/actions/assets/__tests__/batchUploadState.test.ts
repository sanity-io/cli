import {readFile, rename, rm, writeFile} from 'node:fs/promises'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {readBatchState, writeBatchState} from '../batchUploadState.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

describe('batchUploadState', () => {
  beforeEach(() => vi.resetAllMocks())

  test('starts with empty state when missing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('missing'), {code: 'ENOENT'}))
    expect(await readBatchState('/state')).toEqual({entries: [], version: 1})
  })

  test('reads valid state', async () => {
    vi.mocked(readFile).mockResolvedValue('{"version":1,"entries":[]}')
    expect(await readBatchState('/state')).toEqual({entries: [], version: 1})
  })

  test.each(['invalid', '{"version":2,"entries":[]}', '{"version":1,"entries":[{}]}'])(
    'rejects corrupted state %s',
    async (contents) => {
      vi.mocked(readFile).mockResolvedValue(contents)
      await expect(readBatchState('/state')).rejects.toThrow('Cannot read resume state')
    },
  )

  test('writes a private temporary file and atomically replaces state', async () => {
    await writeBatchState('/batch/state.json', {entries: [], version: 1})
    const temporary = vi.mocked(writeFile).mock.calls[0][0]
    expect(temporary).toMatch(/^\/batch\/state.json\..+\.tmp$/)
    expect(JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)).toEqual({
      entries: [],
      version: 1,
    })
    expect(writeFile).toHaveBeenCalledWith(temporary, expect.any(String), {
      flag: 'wx',
      mode: 0o600,
    })
    expect(rename).toHaveBeenCalledWith(temporary, '/batch/state.json')
    expect(rm).toHaveBeenCalledWith(temporary, {force: true})
    expect(vi.mocked(writeFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rename).mock.invocationCallOrder[0],
    )
  })

  test('cleans up when replacing state fails', async () => {
    vi.mocked(rename).mockRejectedValue(new Error('disk full'))
    await expect(writeBatchState('/state', {entries: [], version: 1})).rejects.toThrow('disk full')
    expect(rm).toHaveBeenCalledOnce()
  })
})
