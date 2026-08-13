import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {spinner, spinnerSucceed, spinnerText} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {uploadAssetWithProgress} from '../uploadAssetWithProgress.js'

const mockUploadAssetFromFile = vi.hoisted(() => vi.fn())

vi.mock('../uploadAssetFromFile.js', () => ({uploadAssetFromFile: mockUploadAssetFromFile}))
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

const imageAsset = {_id: 'image-abc-100x100-png'}
const defaultOptions = {
  assetType: 'image' as const,
  dataset: 'production',
  filename: 'hero.png',
  filePath: '/private/tmp/hero.png',
  isInteractive: false,
  logToStderr: vi.fn(),
  projectId: 'test-project',
}

describe('uploadAssetWithProgress', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('reports bounded progress outside an interactive terminal', async () => {
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(8)
      onProgress(23)
      onProgress(27)
      onProgress(27)
      onProgress(24)
      onProgress(52)
      onProgress(108)
      return imageAsset
    })

    await expect(uploadAssetWithProgress(defaultOptions)).resolves.toBe(imageAsset)

    expect(spinner).toHaveBeenCalledWith(
      'Uploading image asset. Large uploads may take several minutes.',
    )
    expect(spinnerText.mock.calls).toEqual([
      ['Uploading image asset [8%]'],
      ['Uploading image asset [23%]'],
      ['Uploading image asset [27%]'],
      ['Uploading image asset [52%]'],
      ['Creating image asset document'],
    ])
    expect(defaultOptions.logToStderr.mock.calls).toEqual([
      ['Uploading image asset [25%]'],
      ['Uploading image asset [50%]'],
      ['Creating image asset document'],
    ])
    expect(spinnerSucceed).toHaveBeenCalledWith(`Uploaded image asset: ${imageAsset._id}`)
  })

  test('reports progress through an execution context', async () => {
    const progress: string[] = []
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(26)
      onProgress(51)
      onProgress(76)
      onProgress(100)
      return imageAsset
    })

    await runWithCliExecutionContext({stderr: (line) => progress.push(line)}, () =>
      uploadAssetWithProgress({...defaultOptions, logToStderr: (line) => progress.push(line)}),
    )

    expect(progress).toEqual([
      'Uploading image asset. Large uploads may take several minutes.',
      'Uploading image asset [25%]',
      'Uploading image asset [50%]',
      'Uploading image asset [75%]',
      'Creating image asset document',
      `Uploaded image asset: ${imageAsset._id}`,
    ])
  })

  test('preserves completed upload phases in an interactive terminal', async () => {
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(50)
      onProgress(100)
      return imageAsset
    })

    await uploadAssetWithProgress({...defaultOptions, isInteractive: true})

    expect(spinner).toHaveBeenNthCalledWith(
      1,
      'Uploading image asset [0%]. Large uploads may take several minutes.',
    )
    expect(spinner).toHaveBeenNthCalledWith(2, 'Creating image asset document')
    expect(spinner).toHaveBeenNthCalledWith(3)
    expect(spinnerSucceed.mock.calls).toEqual([
      ['Uploading image asset [100%]'],
      ['Creating image asset document'],
      [`Uploaded image asset: ${imageAsset._id}`],
    ])
  })

  test('aborts on SIGINT and leaves process exit to the command', async () => {
    let interruptUpload: (() => void) | undefined
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGINT') interruptUpload = listener as () => void
      return process
    })
    const offSpy = vi.spyOn(process, 'off').mockReturnValue(process)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mockUploadAssetFromFile.mockImplementation(
      ({signal}: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {once: true})
        }),
    )

    try {
      const upload = uploadAssetWithProgress({...defaultOptions, isInteractive: true})
      await vi.waitFor(() => expect(mockUploadAssetFromFile).toHaveBeenCalledOnce())
      interruptUpload?.()

      await expect(upload).rejects.toThrow('SIGINT')
      expect(exitSpy).not.toHaveBeenCalled()
      expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(spinner.mock.results[0]?.value.stop).toHaveBeenCalledOnce()
    } finally {
      onceSpy.mockRestore()
      offSpy.mockRestore()
      exitSpy.mockRestore()
    }
  })

  test('stops progress and preserves upload errors', async () => {
    const error = new Error('upload failed')
    mockUploadAssetFromFile.mockRejectedValue(error)

    await expect(uploadAssetWithProgress(defaultOptions)).rejects.toBe(error)

    expect(spinner.mock.results[0]?.value.stop).toHaveBeenCalledOnce()
  })
})
