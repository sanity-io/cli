import {createReadStream} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {Readable} from 'node:stream'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getBatchLocalPath, prepareBatchEntry, readBatchManifest} from '../batchManifest.js'

vi.mock('node:fs', () => ({createReadStream: vi.fn()}))
vi.mock('node:fs/promises', () => ({readFile: vi.fn(), stat: vi.fn()}))

describe('batchManifest', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(stat).mockResolvedValue({isFile: () => true} as never)
    vi.mocked(createReadStream).mockImplementation(
      () => Readable.from([Buffer.from('content')]) as never,
    )
  })

  test('keeps metadata opaque and preserves keys', async () => {
    const entry = {documentId: 'doc', fieldPath: 'image', key: 'a', source: 'a.png'}
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({assets: [entry], version: 1}))
    expect(await readBatchManifest('/manifest.json')).toEqual([{key: 'a', value: entry}])
  })

  test.each([
    {assets: [], version: 2},
    {assets: {}, version: 1},
    {assets: [{key: 'a'}, {key: 'a'}], version: 1},
    {assets: [{key: ''}], version: 1},
    {assets: [null], version: 1},
  ])('rejects invalid structure %j', async (value) => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(value))
    await expect(readBatchManifest('/manifest.json')).rejects.toThrow('Invalid manifest')
  })

  test('does not expose invalid JSON contents', async () => {
    vi.mocked(readFile).mockResolvedValue('secret=token')
    await expect(readBatchManifest('/manifest.json')).rejects.toThrow('Use a readable JSON file')
  })

  test('resolves local paths relative to the manifest and hashes content', async () => {
    const entry = {key: 'a', value: {key: 'a', source: './hero.png'}}
    const first = await prepareBatchEntry(entry, '/manifest/assets.json')
    expect(first).toMatchObject({
      filename: 'hero.png',
      filePath: '/manifest/hero.png',
      type: 'image',
    })
    vi.mocked(createReadStream).mockReturnValueOnce(
      Readable.from([Buffer.from('changed')]) as never,
    )
    const second = await prepareBatchEntry(entry, '/manifest/assets.json')
    expect(second.fingerprint).not.toBe(first.fingerprint)
  })

  test.each(['filename', 'contentType', 'source', 'type'])(
    'fingerprints include %s',
    async (field) => {
      const entry = {
        contentType: 'image/png',
        filename: 'hero.png',
        key: 'a',
        source: './hero.png',
        type: 'image',
      }
      const first = await prepareBatchEntry({key: 'a', value: entry}, '/manifest.json')
      const changed = {
        ...entry,
        [field]: field === 'type' ? 'file' : field === 'source' ? './other.png' : 'changed',
      }
      const second = await prepareBatchEntry({key: 'a', value: changed}, '/manifest.json')
      expect(second.fingerprint).not.toBe(first.fingerprint)
    },
  )

  test('rejects directories', async () => {
    vi.mocked(stat).mockResolvedValue({isFile: () => false} as never)
    await expect(
      prepareBatchEntry({key: 'a', value: {key: 'a', source: '.'}}, '/manifest.json'),
    ).rejects.toThrow('readable file')
  })

  test('rejects invalid entry fields', async () => {
    await expect(
      prepareBatchEntry({key: 'a', value: {key: 'a', source: 1}}, '/manifest.json'),
    ).rejects.toThrow('Check the source')
  })

  test('extracts source paths for state collision checks', () => {
    expect(getBatchLocalPath({key: 'a', value: {source: './a.png'}}, '/batch/assets.json')).toBe(
      '/batch/a.png',
    )
    for (const value of [null, {source: 1}, {}]) {
      expect(getBatchLocalPath({key: 'a', value}, '/batch/assets.json')).toBeUndefined()
    }
  })
})
