import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type BatchResult,
  uploadAssetBatch,
} from '../../../../../src/actions/assets/uploadAssetBatch.js'
import {uploadAsset} from '../../../../../src/services/assets.js'

vi.mock('../../../../../src/services/assets.js', () => ({uploadAsset: vi.fn()}))

describe('batch asset upload filesystem workflow', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'batch-assets-test-'))
    vi.mocked(uploadAsset).mockImplementation(async ({body, filename}) => {
      let text = ''
      for await (const chunk of body) text += chunk.toString()
      if (text === 'broken') throw new Error('unsupported image')
      return {_id: `file-${filename}-${text}`, url: 'https://cdn.sanity.io/asset'} as never
    })
  })
  afterEach(async () => {
    await rm(directory, {force: true, recursive: true})
    vi.resetAllMocks()
  })

  test('uploads local image and file assets with complete references', async () => {
    const manifestPath = join(directory, 'assets.json')
    await writeFile(join(directory, 'one.txt'), 'local')
    await writeFile(join(directory, 'two.png'), 'image')
    await writeFile(
      manifestPath,
      JSON.stringify({
        assets: [
          {key: 'one', source: './one.txt', type: 'file'},
          {
            key: 'two',
            source: './two.png',
            type: 'image',
          },
        ],
        version: 1,
      }),
    )
    const results: BatchResult[] = []
    expect(
      await uploadAssetBatch({
        dataset: 'production',
        manifestPath,
        onResult: (result) => results.push(result),
        projectId: 'project',
        resume: true,
      }),
    ).toBe(true)
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asset: {_id: 'file-one.txt-local', url: 'https://cdn.sanity.io/asset'},
          key: 'one',
          reference: {_type: 'file', asset: {_ref: 'file-one.txt-local', _type: 'reference'}},
          status: 'uploaded',
        }),
        expect.objectContaining({
          asset: {_id: 'file-two.png-image', url: 'https://cdn.sanity.io/asset'},
          key: 'two',
          reference: {_type: 'image', asset: {_ref: 'file-two.png-image', _type: 'reference'}},
          status: 'uploaded',
        }),
      ]),
    )
    const state = await readFile(`${manifestPath}.state.json`, 'utf8')
    expect(state).not.toContain(directory)
  })

  test('resumes partial success, detects changed content, and keeps valid atomic state', async () => {
    const manifestPath = join(directory, 'assets.json')
    await writeFile(join(directory, 'one.txt'), 'one')
    await writeFile(join(directory, 'two.txt'), 'broken')
    await writeFile(
      manifestPath,
      JSON.stringify({
        assets: [
          {key: 'one', source: './one.txt', type: 'file'},
          {key: 'two', source: './two.txt', type: 'file'},
        ],
        version: 1,
      }),
    )
    const results: BatchResult[] = []
    const options = {
      dataset: 'production',
      manifestPath,
      onResult: (result: BatchResult) => results.push(result),
      projectId: 'project',
      resume: true,
    }
    expect(await uploadAssetBatch(options)).toBe(false)
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({key: 'one', status: 'uploaded'}),
        expect.objectContaining({key: 'two', status: 'failed'}),
      ]),
    )
    expect(JSON.parse(await readFile(`${manifestPath}.state.json`, 'utf8')).entries).toHaveLength(1)

    await writeFile(join(directory, 'two.txt'), 'two')
    results.length = 0
    vi.mocked(uploadAsset).mockClear()
    expect(await uploadAssetBatch(options)).toBe(true)
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({key: 'one', status: 'skipped'}),
        expect.objectContaining({key: 'two', status: 'uploaded'}),
      ]),
    )
    expect(uploadAsset).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(`${manifestPath}.state.json`, 'utf8')).entries).toHaveLength(2)

    await writeFile(join(directory, 'one.txt'), 'new')
    results.length = 0
    vi.mocked(uploadAsset).mockClear()
    expect(await uploadAssetBatch(options)).toBe(true)
    expect(uploadAsset).toHaveBeenCalledOnce()
    expect(results.find((result) => result.key === 'one')).toMatchObject({status: 'uploaded'})
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('dry run reports missing files and performs no uploads or state writes', async () => {
    const manifestPath = join(directory, 'assets.json')
    await writeFile(join(directory, 'image.png'), 'image')
    await writeFile(
      manifestPath,
      JSON.stringify({
        assets: [
          {key: 'missing', source: './missing.png'},
          {key: 'image', source: './image.png'},
        ],
        version: 1,
      }),
    )
    const results: BatchResult[] = []
    expect(
      await uploadAssetBatch({
        dataset: 'production',
        dryRun: true,
        manifestPath,
        onResult: (result) => results.push(result),
        projectId: 'project',
        resume: true,
      }),
    ).toBe(false)
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({key: 'missing', status: 'failed'}),
        {key: 'image', status: 'validated'},
      ]),
    )
    expect(uploadAsset).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual(['assets.json', 'image.png'])
  })
})
