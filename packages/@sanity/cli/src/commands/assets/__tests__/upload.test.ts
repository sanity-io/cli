import {resolve} from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetFileError} from '../../../actions/assets/assetFileError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UploadAssetCommand} from '../upload.js'

const mockUploadAssetWithProgress = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/assets/uploadAssetWithProgress.js', () => ({
  uploadAssetWithProgress: mockUploadAssetWithProgress,
}))

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: 'test-project'}},
  isInteractive: false,
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
    mockUploadAssetWithProgress.mockImplementation(async ({logToStderr}) => {
      logToStderr('Uploading image asset [25%]')
      return imageAsset
    })

    const {error, stderr, stdout} = await testCommand(
      UploadAssetCommand,
      ['--file', './hero.png', '--content-type', 'image/png'],
      {mocks: defaultMocks},
    )

    if (error) throw error
    expect(mockUploadAssetWithProgress).toHaveBeenCalledWith({
      assetType: 'image',
      contentType: 'image/png',
      dataset: 'production',
      filename: 'hero.png',
      filePath: resolve('./hero.png'),
      isInteractive: false,
      logToStderr: expect.any(Function),
      projectId: 'test-project',
    })
    expect(stderr).toBe('Uploading image asset [25%]\n')
    expect(JSON.parse(stdout)).toEqual({
      asset: imageAsset,
      reference: {
        _type: 'image',
        asset: {_ref: imageAsset._id, _type: 'reference'},
      },
    })
  })

  test('supports file assets and explicit target metadata outside a project', async () => {
    mockUploadAssetWithProgress.mockResolvedValue({
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
      {mocks: {isInteractive: true, token: 'test-token'}},
    )

    if (error) throw error
    expect(mockUploadAssetWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        assetType: 'file',
        dataset: 'staging',
        filename: 'public-name.pdf',
        isInteractive: true,
        projectId: 'other-project',
      }),
    )
    expect(JSON.parse(stdout).reference._type).toBe('file')
  })

  test('lets the base command handle SIGINT', async () => {
    mockUploadAssetWithProgress.mockRejectedValue(new Error('SIGINT'))

    const {error, stderr} = await testCommand(
      UploadAssetCommand,
      ['--file', './hero.png', '--content-type', 'image/png'],
      {mocks: defaultMocks},
    )

    expect(error?.oclif?.exit).toBe(exitCodes.SIGINT)
    expect(stderr).toContain('Aborted by user')
  })

  test('rejects a directory', async () => {
    mockUploadAssetWithProgress.mockRejectedValue(new AssetFileError('not-file'))

    const {error} = await testCommand(UploadAssetCommand, ['--file', '.'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('--file must point to a file, not a directory')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockUploadAssetWithProgress).toHaveBeenCalledOnce()
  })

  test('reports unreadable paths with a fix', async () => {
    mockUploadAssetWithProgress.mockRejectedValue(new AssetFileError('unreadable'))

    const {error} = await testCommand(UploadAssetCommand, ['--file', './missing.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Cannot read the local file')
    expect(error?.message).toContain('Check that --file points to a readable file, then retry')
    expect(error?.message).not.toContain('missing.png')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockUploadAssetWithProgress).toHaveBeenCalledOnce()
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
    mockUploadAssetWithProgress.mockRejectedValue(new Error('Forbidden'))

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
