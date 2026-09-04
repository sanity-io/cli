import {resolve} from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetFileError} from '../../../actions/assets/assetFileError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UploadAssetCommand} from '../upload.js'

const mockUploadAssetWithProgress = vi.hoisted(() => vi.fn())
const mockIngestAssetFromUrlWithProgress = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/assets/uploadAssetWithProgress.js', () => ({
  uploadAssetWithProgress: mockUploadAssetWithProgress,
}))

vi.mock('../../../actions/assets/ingestAssetFromUrlWithProgress.js', () => ({
  ingestAssetFromUrlWithProgress: mockIngestAssetFromUrlWithProgress,
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

  test('redacts the source URL from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'assets',
        'upload',
        '--from-url=https://private.example.com/hero.png?signature=secret',
        '--dataset=production',
      ],
      UploadAssetCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--from-url', '--dataset=production'])
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

  test('formats the API response body with asset upload guidance', async () => {
    mockUploadAssetWithProgress.mockRejectedValue(
      Object.assign(new Error('HTTP 422'), {
        response: {
          body: {
            details:
              'source: bad seek to 1807\nheif: Support for this compression format has not been built in (11.6003)',
            error: 'Unprocessable Entity',
            message: 'Invalid image, could not process',
            statusCode: 422,
          },
          headers: {},
          method: 'POST',
          statusCode: 422,
          statusMessage: 'Unprocessable Entity',
          url: 'https://test-project.api.sanity.io/v2024-06-24/assets/images/production',
        },
        statusCode: 422,
      }),
    )

    const {error} = await testCommand(UploadAssetCommand, ['--file', './hero.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(
      `Asset upload failed: HTTP 422 - Unprocessable Entity
Invalid image, could not process.

Details:
source: bad seek to 1807
heif: Support for this compression format has not been built in (11.6003)

Check the asset requirements and current technical limits, then try again: https://www.sanity.io/docs/content-lake/technical-limits#k2c53dc30e24b`,
    )
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('suggests logging in again for an unauthorized upload', async () => {
    mockUploadAssetWithProgress.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), {
        response: {
          body: {error: 'Unauthorized', message: 'Unauthorized', statusCode: 401},
          headers: {},
          method: 'POST',
          statusCode: 401,
          statusMessage: 'Unauthorized',
          url: 'https://test-project.api.sanity.io/v2024-06-24/assets/images/production',
        },
        statusCode: 401,
      }),
    )

    const {error} = await testCommand(UploadAssetCommand, ['--file', './hero.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Run `sanity login` to authenticate, then try again')
  })

  test('preserves project membership guidance without suggesting login', async () => {
    const membersUrl = 'https://www.sanity.io/manage/project/test-project/members'
    mockUploadAssetWithProgress.mockRejectedValue(
      Object.assign(
        new Error(`Project user not found. Add this account as a project member: ${membersUrl}.`),
        {
          response: {
            body: {
              error: {type: 'projectUserNotFoundError'},
              message: 'Project user not found',
              statusCode: 401,
            },
            headers: {},
            method: 'POST',
            statusCode: 401,
            statusMessage: 'Unauthorized',
            url: 'https://test-project.api.sanity.io/v2024-06-24/assets/images/production',
          },
          statusCode: 401,
        },
      ),
    )

    const {error} = await testCommand(UploadAssetCommand, ['--file', './hero.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(`Add this account as a project member: ${membersUrl}`)
    expect(error?.message).not.toContain('sanity login')
  })

  test('requires a source', async () => {
    const {error} = await testCommand(UploadAssetCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain(
      'Exactly one of the following must be provided: --file, --from-url',
    )
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects --file combined with --from-url', async () => {
    const {error} = await testCommand(
      UploadAssetCommand,
      ['--file', './hero.png', '--from-url', 'https://example.com/hero.png'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('--file cannot also be provided when using --from-url')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('ingests from a URL and prints a reusable image reference', async () => {
    mockIngestAssetFromUrlWithProgress.mockImplementation(async ({logToStderr}) => {
      logToStderr('Fetching image asset from URL')
      return imageAsset
    })

    const {error, stderr, stdout} = await testCommand(
      UploadAssetCommand,
      ['--from-url', 'https://example.com/hero.png'],
      {mocks: defaultMocks},
    )

    if (error) throw error
    expect(mockUploadAssetWithProgress).not.toHaveBeenCalled()
    expect(mockIngestAssetFromUrlWithProgress).toHaveBeenCalledWith({
      assetType: 'image',
      dataset: 'production',
      filename: undefined,
      isInteractive: false,
      logToStderr: expect.any(Function),
      projectId: 'test-project',
      url: 'https://example.com/hero.png',
    })
    expect(stderr).toBe('Fetching image asset from URL\n')
    expect(JSON.parse(stdout)).toEqual({
      asset: imageAsset,
      reference: {
        _type: 'image',
        asset: {_ref: imageAsset._id, _type: 'reference'},
      },
    })
  })

  test('passes an explicit --filename through to URL ingestion', async () => {
    mockIngestAssetFromUrlWithProgress.mockResolvedValue(imageAsset)

    const {error} = await testCommand(
      UploadAssetCommand,
      ['--from-url', 'https://example.com/download?id=42', '--filename', 'hero.png'],
      {mocks: defaultMocks},
    )

    if (error) throw error
    expect(mockIngestAssetFromUrlWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({filename: 'hero.png'}),
    )
  })

  test('rejects --content-type combined with --from-url', async () => {
    const {error} = await testCommand(
      UploadAssetCommand,
      ['--from-url', 'https://example.com/hero.png', '--content-type', 'image/png'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('--content-type cannot be combined with --from-url')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockIngestAssetFromUrlWithProgress).not.toHaveBeenCalled()
  })

  test('explains a failed fetch of the source URL', async () => {
    mockIngestAssetFromUrlWithProgress.mockRejectedValue(
      Object.assign(new Error('Could not fetch source'), {
        response: {
          body: {error: 'Bad Gateway', message: 'Could not fetch source', statusCode: 502},
          headers: {},
          method: 'POST',
          statusCode: 502,
          statusMessage: 'Bad Gateway',
          url: 'https://test-project.api.sanity.io/v2024-06-24/assets/images/production/from-url',
        },
        statusCode: 502,
      }),
    )

    const {error} = await testCommand(
      UploadAssetCommand,
      ['--from-url', 'https://example.com/hero.png'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('Sanity could not fetch the source URL')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })
})
