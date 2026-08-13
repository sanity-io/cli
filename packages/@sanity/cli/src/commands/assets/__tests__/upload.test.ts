import {resolve} from 'node:path'

import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {testCommand} from '@sanity/cli-test'
import {spinner, spinnerSucceed, spinnerText} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetFileError} from '../../../actions/assets/assetFileError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UploadAssetCommand} from '../upload.js'

const mockUploadAssetFromFile = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/assets/uploadAssetFromFile.js', () => ({
  uploadAssetFromFile: mockUploadAssetFromFile,
}))
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: 'test-project'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const imageAsset = {
  _id: 'image-abc-100x100-png',
  _type: 'sanity.imageAsset',
  extension: 'png',
  mimeType: 'image/png',
  originalFilename: 'hero.png',
  size: 123,
  url: 'https://cdn.sanity.io/images/test-project/production/abc-100x100.png',
}

describe('#assets:upload', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('redacts local paths and filenames from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'assets',
        'upload',
        '--file=/Users/test/private/hero.png',
        '--filename=private-hero.png',
        '--dataset=production',
      ],
      UploadAssetCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--filename', '--dataset=production'])
  })

  test('uploads an image and prints a reusable image reference', async () => {
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(8)
      onProgress(23)
      onProgress(27)
      onProgress(100)
      return imageAsset
    })

    const {error, stderr, stdout} = await testCommand(
      UploadAssetCommand,
      ['--file', './hero.png', '--content-type', 'image/png'],
      {mocks: defaultMocks},
    )

    if (error) throw error
    expect(mockUploadAssetFromFile).toHaveBeenCalledWith({
      assetType: 'image',
      contentType: 'image/png',
      dataset: 'production',
      filename: 'hero.png',
      filePath: resolve('./hero.png'),
      onProgress: expect.any(Function),
      projectId: 'test-project',
      signal: expect.any(AbortSignal),
    })
    expect(spinner).toHaveBeenCalledWith(
      'Uploading image asset. Large uploads may take several minutes.',
    )
    expect(spinnerText.mock.calls).toEqual([
      ['Uploading image asset [8%]'],
      ['Uploading image asset [23%]'],
      ['Uploading image asset [27%]'],
      ['Creating image asset document'],
    ])
    expect(spinnerSucceed).toHaveBeenCalledWith(`Uploaded image asset: ${imageAsset._id}`)
    expect(stderr).toBe('Uploading image asset [25%]\nCreating image asset document\n')
    expect(JSON.parse(stdout)).toEqual({
      asset: imageAsset,
      reference: {
        _type: 'image',
        asset: {_ref: imageAsset._id, _type: 'reference'},
      },
    })
  })

  test('reports bounded progress through the agent execution context', async () => {
    const progress: string[] = []
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(26)
      onProgress(51)
      onProgress(76)
      onProgress(100)
      return imageAsset
    })

    const {error} = await runWithCliExecutionContext({stderr: (line) => progress.push(line)}, () =>
      testCommand(UploadAssetCommand, ['--file', './hero.png', '--content-type', 'image/png'], {
        mocks: defaultMocks,
      }),
    )

    if (error) throw error
    expect(progress).toEqual([
      'Uploading image asset. Large uploads may take several minutes.',
      'Uploading image asset [25%]',
      'Uploading image asset [50%]',
      'Uploading image asset [75%]',
      'Creating image asset document',
      `Uploaded image asset: ${imageAsset._id}`,
    ])
  })

  test('supports file assets and explicit target metadata outside a project', async () => {
    mockUploadAssetFromFile.mockResolvedValue({
      ...imageAsset,
      _id: 'file-def-pdf',
      _type: 'sanity.fileAsset',
      extension: 'pdf',
      mimeType: 'application/pdf',
      originalFilename: 'public-name.pdf',
    })

    const {error, stdout} = await testCommand(
      UploadAssetCommand,
      [
        '--file',
        './private-name.pdf',
        '--type',
        'file',
        '--filename',
        'public-name.pdf',
        '--project-id',
        'other-project',
        '--dataset',
        'staging',
      ],
      {mocks: {token: 'test-token'}},
    )

    if (error) throw error
    expect(mockUploadAssetFromFile).toHaveBeenCalledWith(
      expect.objectContaining({
        assetType: 'file',
        dataset: 'staging',
        filename: 'public-name.pdf',
        projectId: 'other-project',
      }),
    )
    expect(JSON.parse(stdout).reference._type).toBe('file')
  })

  test('preserves completed upload phases in a terminal', async () => {
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')
    Object.defineProperty(process.stderr, 'isTTY', {configurable: true, value: true})
    mockUploadAssetFromFile.mockImplementation(async ({onProgress}) => {
      onProgress(50)
      onProgress(100)
      return imageAsset
    })

    try {
      const {error} = await testCommand(
        UploadAssetCommand,
        ['--file', './hero.png', '--content-type', 'image/png'],
        {mocks: defaultMocks},
      )

      if (error) throw error
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
    } finally {
      if (isTTYDescriptor) {
        Object.defineProperty(process.stderr, 'isTTY', isTTYDescriptor)
      } else {
        delete (process.stderr as {isTTY?: boolean}).isTTY
      }
    }
  })

  test('aborts an active upload on SIGINT', async () => {
    let interruptUpload: (() => void) | undefined
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'SIGINT') interruptUpload = listener as () => void
      return process
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mockUploadAssetFromFile.mockImplementation(
      ({signal}: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {once: true})
        }),
    )

    try {
      const command = testCommand(
        UploadAssetCommand,
        ['--file', './hero.png', '--content-type', 'image/png'],
        {mocks: defaultMocks},
      )
      await vi.waitFor(() => expect(mockUploadAssetFromFile).toHaveBeenCalledOnce())
      expect(interruptUpload).toBeDefined()
      interruptUpload?.()
      expect(exitSpy).toHaveBeenCalledWith(exitCodes.SIGINT)

      const {error, stderr} = await command
      expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
      expect(stderr).toContain('Aborted by user')
    } finally {
      onceSpy.mockRestore()
      exitSpy.mockRestore()
    }
  })

  test('aborts on a Ctrl+C input byte when the terminal does not emit SIGINT', async () => {
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true})
    let interruptInput: ((input: Buffer) => void) | undefined
    const stdinOnSpy = vi.spyOn(process.stdin, 'on').mockImplementation(((
      event: string,
      listener: (input: Buffer) => void,
    ) => {
      if (event === 'data') interruptInput = listener
      return process.stdin
    }) as typeof process.stdin.on)
    const stdinOffSpy = vi.spyOn(process.stdin, 'off').mockReturnValue(process.stdin)
    const stdinResumeSpy = vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin)
    const stdinPauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    mockUploadAssetFromFile.mockImplementation(
      ({signal}: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {once: true})
        }),
    )

    try {
      const command = testCommand(
        UploadAssetCommand,
        ['--file', './hero.png', '--content-type', 'image/png'],
        {mocks: defaultMocks},
      )
      await vi.waitFor(() => expect(mockUploadAssetFromFile).toHaveBeenCalledOnce())
      expect(interruptInput).toBeDefined()
      interruptInput?.(Buffer.from([3]))
      expect(exitSpy).toHaveBeenCalledWith(exitCodes.SIGINT)

      const {error, stderr} = await command
      expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
      expect(stderr).toContain('Aborted by user')
      expect(stdinOffSpy).toHaveBeenCalledWith('data', expect.any(Function))
      expect(stdinPauseSpy).toHaveBeenCalledOnce()
    } finally {
      stdinOnSpy.mockRestore()
      stdinOffSpy.mockRestore()
      stdinResumeSpy.mockRestore()
      stdinPauseSpy.mockRestore()
      exitSpy.mockRestore()
      if (isTTYDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', isTTYDescriptor)
      } else {
        delete (process.stdin as {isTTY?: boolean}).isTTY
      }
    }
  })

  test('rejects a directory', async () => {
    mockUploadAssetFromFile.mockRejectedValue(new AssetFileError('not-file'))

    const {error} = await testCommand(UploadAssetCommand, ['--file', '.'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('--file must point to a file, not a directory')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockUploadAssetFromFile).toHaveBeenCalledOnce()
  })

  test('reports unreadable paths with a fix', async () => {
    mockUploadAssetFromFile.mockRejectedValue(new AssetFileError('unreadable'))

    const {error} = await testCommand(UploadAssetCommand, ['--file', './missing.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Cannot read the local file')
    expect(error?.message).toContain('Check that --file points to a readable file, then retry')
    expect(error?.message).not.toContain('missing.png')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockUploadAssetFromFile).toHaveBeenCalledOnce()
  })

  test('requires a dataset', async () => {
    const {error} = await testCommand(UploadAssetCommand, ['--file', './hero.png'], {
      mocks: {...defaultMocks, cliConfig: {api: {projectId: 'test-project'}}},
    })

    expect(error?.message).toContain('Dataset is required')
    expect(error?.message).toContain('Pass --dataset')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('reports upload failures with authentication and permission guidance', async () => {
    mockUploadAssetFromFile.mockRejectedValue(new Error('Forbidden'))

    const {error} = await testCommand(UploadAssetCommand, ['--file', './hero.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Asset upload failed')
    expect(error?.message).toContain(
      'Check authentication, write access, and that the local file is still readable, then retry',
    )
    expect(error?.message).not.toContain('Forbidden')
    expect(error?.message).not.toContain('hero.png')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('requires --file', async () => {
    const {error} = await testCommand(UploadAssetCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('Missing required flag file')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })
})
