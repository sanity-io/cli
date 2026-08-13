import {open} from 'node:fs/promises'
import {Readable} from 'node:stream'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {uploadAssetFromFile} from '../uploadAssetFromFile.js'

const mockUploadAsset = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  open: vi.fn(),
}))

vi.mock('../../../services/assets.js', () => ({uploadAsset: mockUploadAsset}))

const mockOpen = vi.mocked(open)

function createFileHandle({isFile = true, size = 123} = {}) {
  const fileStream = new Readable({read() {}})
  return {
    fileHandle: {
      close: vi.fn().mockResolvedValue(undefined),
      createReadStream: vi.fn().mockReturnValue(fileStream),
      stat: vi.fn().mockResolvedValue({isFile: () => isFile, size}),
    },
    fileStream,
  }
}

describe('uploadAssetFromFile', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uploads from the same file handle used to determine the size', async () => {
    const {fileHandle, fileStream} = createFileHandle()
    const asset = {_id: 'image-abc-1x1-png'}
    mockOpen.mockResolvedValue(fileHandle as never)
    mockUploadAsset.mockResolvedValue(asset)

    await expect(
      uploadAssetFromFile({
        assetType: 'image',
        contentType: 'image/png',
        dataset: 'production',
        filename: 'hero.png',
        filePath: '/private/tmp/hero.png',
        projectId: 'test-project',
      }),
    ).resolves.toBe(asset)

    expect(mockOpen).toHaveBeenCalledWith('/private/tmp/hero.png', 'r')
    expect(fileHandle.createReadStream).toHaveBeenCalledWith({autoClose: false})
    expect(mockUploadAsset).toHaveBeenCalledWith({
      assetType: 'image',
      body: fileStream,
      contentType: 'image/png',
      dataset: 'production',
      filename: 'hero.png',
      fileSize: 123,
      projectId: 'test-project',
    })
    expect(fileHandle.close).toHaveBeenCalledOnce()
    expect(fileStream.destroyed).toBe(true)
  })

  test('rejects directories without starting an upload', async () => {
    const {fileHandle} = createFileHandle({isFile: false})
    mockOpen.mockResolvedValue(fileHandle as never)

    await expect(
      uploadAssetFromFile({
        assetType: 'file',
        dataset: 'production',
        filename: 'fixtures',
        filePath: '/private/tmp/fixtures',
        projectId: 'test-project',
      }),
    ).rejects.toMatchObject({reason: 'not-file'})

    expect(fileHandle.close).toHaveBeenCalledOnce()
    expect(mockUploadAsset).not.toHaveBeenCalled()
  })

  test('reports files that cannot be opened as unreadable', async () => {
    mockOpen.mockRejectedValue(new Error('ENOENT'))

    await expect(
      uploadAssetFromFile({
        assetType: 'image',
        dataset: 'production',
        filename: 'missing.png',
        filePath: '/private/tmp/missing.png',
        projectId: 'test-project',
      }),
    ).rejects.toMatchObject({reason: 'unreadable'})

    expect(mockUploadAsset).not.toHaveBeenCalled()
  })

  test('closes the file handle when the upload fails', async () => {
    const {fileHandle, fileStream} = createFileHandle()
    mockOpen.mockResolvedValue(fileHandle as never)
    mockUploadAsset.mockRejectedValue(new Error('upload failed'))

    await expect(
      uploadAssetFromFile({
        assetType: 'image',
        dataset: 'production',
        filename: 'hero.png',
        filePath: '/private/tmp/hero.png',
        projectId: 'test-project',
      }),
    ).rejects.toThrow('upload failed')

    expect(fileHandle.close).toHaveBeenCalledOnce()
    expect(fileStream.destroyed).toBe(true)
  })
})
