import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getBatchLocalPath, prepareBatchEntry, readBatchManifest} from '../batchManifest.js'
import {readBatchState, writeBatchState} from '../batchUploadState.js'
import {type BatchResult, uploadAssetBatch} from '../uploadAssetBatch.js'
import {uploadAssetFromFile} from '../uploadAssetFromFile.js'

vi.mock('../batchManifest.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../batchManifest.js')>()),
  getBatchLocalPath: vi.fn(),
  prepareBatchEntry: vi.fn(),
  readBatchManifest: vi.fn(),
}))
vi.mock('../batchUploadState.js')
vi.mock('../uploadAssetFromFile.js')

const asset = {_id: 'image-abc-1x1-png', url: 'https://cdn.sanity.io/image.png'}
const results: BatchResult[] = []
const options = {
  dataset: 'production',
  manifestPath: '/batch/assets.json',
  onResult: (result: BatchResult) => results.push(result),
  projectId: 'project',
}

function manifest(count: number) {
  vi.mocked(readBatchManifest).mockResolvedValue(
    Array.from({length: count}, (_, i) => ({key: String(i), value: {}})),
  )
}

describe('uploadAssetBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    results.length = 0
    manifest(1)
    vi.mocked(prepareBatchEntry).mockImplementation(async ({key}) => ({
      filename: 'image.png',
      filePath: '/batch/image.png',
      fingerprint: `hash-${key}`,
      key,
      source: './image.png',
      type: 'image',
    }))
    vi.mocked(readBatchState).mockResolvedValue({entries: [], version: 1})
    vi.mocked(uploadAssetFromFile).mockResolvedValue(asset as never)
  })

  test('uploads entries and includes complete references', async () => {
    expect(await uploadAssetBatch(options)).toBe(true)
    expect(results).toEqual([
      {
        asset,
        key: '0',
        reference: {_type: 'image', asset: {_ref: asset._id, _type: 'reference'}},
        status: 'uploaded',
      },
    ])
    expect(writeBatchState).not.toHaveBeenCalled()
  })

  test('uploads local files with filename and content type overrides', async () => {
    vi.mocked(prepareBatchEntry).mockResolvedValue({
      contentType: 'application/pdf',
      filename: 'override.pdf',
      filePath: '/batch/a.pdf',
      fingerprint: 'hash',
      key: '0',
      source: './a.pdf',
      type: 'file',
    })
    await uploadAssetBatch(options)
    expect(uploadAssetFromFile).toHaveBeenCalledWith(
      expect.objectContaining({
        assetType: 'file',
        contentType: 'application/pdf',
        filename: 'override.pdf',
        filePath: '/batch/a.pdf',
      }),
    )
    expect(results[0]).toMatchObject({reference: {_type: 'file'}})
  })

  test('does not reserve a state path when resume is disabled', async () => {
    vi.mocked(getBatchLocalPath).mockReturnValue('/batch/assets.json.state.json')
    expect(await uploadAssetBatch(options)).toBe(true)
    expect(uploadAssetFromFile).toHaveBeenCalledOnce()
  })

  test('continues after failures by default', async () => {
    manifest(3)
    vi.mocked(uploadAssetFromFile).mockRejectedValueOnce(new Error('private auth detail'))
    expect(await uploadAssetBatch({...options, concurrency: 1})).toBe(false)
    expect(results.map(({status}) => status)).toEqual(['failed', 'uploaded', 'uploaded'])
    expect(JSON.stringify(results)).not.toContain('private auth detail')
  })

  test('reports every unstarted entry after fail-fast', async () => {
    manifest(3)
    vi.mocked(prepareBatchEntry).mockRejectedValueOnce(new Error('invalid'))
    await uploadAssetBatch({...options, concurrency: 1, failFast: true})
    expect(results.map(({status}) => status)).toEqual(['failed', 'not-started', 'not-started'])
    expect(uploadAssetFromFile).not.toHaveBeenCalled()
  })

  test('bounds active uploads', async () => {
    manifest(6)
    let active = 0
    let maximum = 0
    vi.mocked(uploadAssetFromFile).mockImplementation(async () => {
      active++
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active--
      return asset as never
    })
    await uploadAssetBatch({...options, concurrency: 2})
    expect(maximum).toBe(2)
    expect(results).toHaveLength(6)
  })

  test('dry run validates without reading or writing state or uploading', async () => {
    await uploadAssetBatch({...options, dryRun: true, resume: true})
    expect(results).toEqual([{key: '0', status: 'validated'}])
    expect(readBatchState).not.toHaveBeenCalled()
    expect(writeBatchState).not.toHaveBeenCalled()
    expect(uploadAssetFromFile).not.toHaveBeenCalled()
  })

  test('persists completed entries and skips matching entries on resume', async () => {
    await uploadAssetBatch({...options, resume: true})
    const saved = vi.mocked(writeBatchState).mock.calls[0][1]
    expect(saved.entries[0]).toMatchObject({
      dataset: 'production',
      fingerprint: 'hash-0',
      projectId: 'project',
    })
    vi.mocked(readBatchState).mockResolvedValue(saved)
    vi.mocked(uploadAssetFromFile).mockClear()
    results.length = 0
    await uploadAssetBatch({...options, resume: true})
    expect(results[0]).toMatchObject({asset, status: 'skipped'})
    expect(uploadAssetFromFile).not.toHaveBeenCalled()
  })

  test.each(['dataset', 'projectId', 'fingerprint'] as const)(
    'does not skip when %s changes',
    async (field) => {
      await uploadAssetBatch({...options, resume: true})
      const saved = structuredClone(vi.mocked(writeBatchState).mock.calls[0][1])
      saved.entries[0][field] = 'changed'
      vi.mocked(readBatchState).mockResolvedValue(saved)
      vi.mocked(uploadAssetFromFile).mockClear()
      await uploadAssetBatch({...options, resume: true})
      expect(uploadAssetFromFile).toHaveBeenCalledOnce()
    },
  )

  test('stops scheduling if state cannot be saved', async () => {
    manifest(3)
    vi.mocked(writeBatchState).mockRejectedValue(new Error('disk full'))
    expect(await uploadAssetBatch({...options, concurrency: 1, resume: true})).toBe(false)
    expect(results.map(({status}) => status)).toEqual(['failed', 'not-started', 'not-started'])
    expect(results[0]).toMatchObject({error: {code: 'STATE_WRITE_FAILED'}})
  })

  test.each([0, -1, 1.5, Infinity])('rejects invalid concurrency %s', async (concurrency) => {
    await expect(uploadAssetBatch({...options, concurrency})).rejects.toThrow(
      'positive whole number',
    )
    expect(readBatchManifest).not.toHaveBeenCalled()
  })

  test('rejects overwriting the manifest with state', async () => {
    await expect(
      uploadAssetBatch({...options, resume: true, statePath: options.manifestPath}),
    ).rejects.toThrow('different from the manifest')
  })

  test('rejects overwriting any local source before scheduling uploads', async () => {
    vi.mocked(getBatchLocalPath).mockReturnValue('/batch/image.png')
    await expect(
      uploadAssetBatch({...options, resume: true, statePath: '/batch/image.png'}),
    ).rejects.toThrow('different from every asset source')
    expect(uploadAssetFromFile).not.toHaveBeenCalled()
  })

  test('propagates cancellation after active workers settle', async () => {
    const controller = new AbortController()
    vi.mocked(uploadAssetFromFile).mockImplementation(async () => {
      controller.abort(new Error('SIGINT'))
      throw new Error('aborted')
    })
    await expect(uploadAssetBatch({...options, signal: controller.signal})).rejects.toThrow(
      'SIGINT',
    )
  })
})
