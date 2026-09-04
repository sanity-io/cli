import {Readable} from 'node:stream'

import {getProjectCliClient} from '@sanity/cli-core'
import {Observable} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ASSETS_API_VERSION, ingestAssetFromUrl, uploadAsset} from '../assets.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getProjectCliClient: vi.fn(),
}))

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

function uploadResponse(asset: {_id: string}) {
  return (_assetType: string, body: Readable) =>
    new Observable((subscriber) => {
      body.on('data', () => {})
      body.on('end', () => {
        subscriber.next({body: {document: asset}, type: 'response'})
        subscriber.complete()
      })
      body.on('error', (error) => subscriber.error(error))
    })
}

describe('uploadAsset', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('streams the local file to the configured dataset', async () => {
    const stream = Readable.from([Buffer.alloc(25), Buffer.alloc(75)])
    const asset = {_id: 'image-abc-1x1-png'}
    const upload = vi.fn(uploadResponse(asset))
    const onProgress = vi.fn()
    mockGetProjectCliClient.mockResolvedValue({observable: {assets: {upload}}} as never)

    await expect(
      uploadAsset({
        assetType: 'image',
        body: stream,
        contentType: 'image/png',
        dataset: 'production',
        filename: 'hero.png',
        fileSize: 100,
        onProgress,
        projectId: 'test-project',
      }),
    ).resolves.toBe(asset)

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: ASSETS_API_VERSION,
      dataset: 'production',
      projectId: 'test-project',
      requestTagPrefix: 'sanity.cli.assets.upload',
      requireUser: true,
    })
    expect(upload).toHaveBeenCalledWith('image', expect.any(Readable), {
      contentType: 'image/png',
      filename: 'hero.png',
      tag: 'asset.upload',
    })
    expect(onProgress.mock.calls).toEqual([[25], [100]])
  })

  test('lets the client infer content type when none is supplied', async () => {
    const upload = vi.fn(uploadResponse({_id: 'file-abc-txt'}))
    mockGetProjectCliClient.mockResolvedValue({observable: {assets: {upload}}} as never)

    await uploadAsset({
      assetType: 'file',
      body: Readable.from([Buffer.from('notes')]),
      dataset: 'production',
      filename: 'notes.txt',
      fileSize: 5,
      projectId: 'test-project',
    })

    expect(upload).toHaveBeenCalledWith(
      'file',
      expect.anything(),
      expect.not.objectContaining({contentType: expect.anything()}),
    )
  })

  test('cancels the streams and request when aborted', async () => {
    const stream = new Readable({read() {}})
    const requestTeardown = vi.fn()
    const upload = vi.fn(() => new Observable(() => requestTeardown))
    const controller = new AbortController()
    mockGetProjectCliClient.mockResolvedValue({observable: {assets: {upload}}} as never)

    const result = uploadAsset({
      assetType: 'image',
      body: stream,
      dataset: 'production',
      filename: 'hero.png',
      fileSize: 100,
      projectId: 'test-project',
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce())
    controller.abort(new Error('SIGINT'))

    await expect(result).rejects.toThrow('SIGINT')
    expect(stream.destroyed).toBe(true)
    expect(requestTeardown).toHaveBeenCalledOnce()
  })
})

describe('ingestAssetFromUrl', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('asks Content Lake to fetch the image itself', async () => {
    const asset = {_id: 'image-abc-1x1-png'}
    const request = vi.fn().mockResolvedValue({document: asset})
    mockGetProjectCliClient.mockResolvedValue({request} as never)

    await expect(
      ingestAssetFromUrl({
        assetType: 'image',
        dataset: 'production',
        projectId: 'test-project',
        url: 'https://example.com/hero.png',
      }),
    ).resolves.toBe(asset)

    expect(mockGetProjectCliClient).toHaveBeenCalledWith({
      apiVersion: ASSETS_API_VERSION,
      dataset: 'production',
      projectId: 'test-project',
      requestTagPrefix: 'sanity.cli.assets.upload',
      requireUser: true,
    })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {url: 'https://example.com/hero.png'},
        method: 'POST',
        url: '/assets/images/production/from-url',
      }),
    )
  })

  test('targets the file route for non-image assets', async () => {
    const request = vi.fn().mockResolvedValue({document: {_id: 'file-abc-pdf'}})
    mockGetProjectCliClient.mockResolvedValue({request} as never)

    await ingestAssetFromUrl({
      assetType: 'file',
      dataset: 'staging',
      filename: 'brief.pdf',
      projectId: 'test-project',
      url: 'https://example.com/download?id=42',
    })

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {filename: 'brief.pdf', url: 'https://example.com/download?id=42'},
        url: '/assets/files/staging/from-url',
      }),
    )
  })

  test('omits the filename so Content Lake derives it from the response', async () => {
    const request = vi.fn().mockResolvedValue({document: {_id: 'image-abc-1x1-png'}})
    mockGetProjectCliClient.mockResolvedValue({request} as never)

    await ingestAssetFromUrl({
      assetType: 'image',
      dataset: 'production',
      projectId: 'test-project',
      url: 'https://example.com/hero.png',
    })

    expect(request.mock.calls[0][0].body).not.toHaveProperty('filename')
  })

  test('does not issue the request when already aborted', async () => {
    const request = vi.fn()
    mockGetProjectCliClient.mockResolvedValue({request} as never)
    const controller = new AbortController()
    controller.abort(new Error('SIGINT'))

    await expect(
      ingestAssetFromUrl({
        assetType: 'image',
        dataset: 'production',
        projectId: 'test-project',
        signal: controller.signal,
        url: 'https://example.com/hero.png',
      }),
    ).rejects.toThrow('SIGINT')

    expect(request).not.toHaveBeenCalled()
  })
})
