import {resolve} from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetFileError} from '../../../actions/assets/assetFileError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UploadAssetCommand} from '../upload.js'

const mockUploadAssetBatch = vi.hoisted(() => vi.fn())
vi.mock('../../../actions/assets/uploadAssetBatch.js', () => ({
  uploadAssetBatch: mockUploadAssetBatch,
}))

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

  test('requires --file or --manifest', async () => {
    const {error} = await testCommand(UploadAssetCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('file')
    expect(error?.message).toContain('manifest')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })
})

test('prints only JSONL batch results and exits nonzero for failures', async () => {
  const results = [
    {key: 'one', status: 'uploaded'},
    {error: {code: 'UPLOAD_FAILED', message: 'Could not upload'}, key: 'two', status: 'failed'},
  ]
  mockUploadAssetBatch.mockImplementation(async ({onResult}) => {
    for (const result of results) onResult(result)
    return false
  })
  const {error, stdout} = await testCommand(
    UploadAssetCommand,
    ['--manifest', './assets.json', '--output', 'jsonl', '--resume'],
    {mocks: defaultMocks},
  )
  expect(
    stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  ).toEqual(results)
  expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
})

test.each([
  ['--file', 'a', '--manifest', 'b'],
  ['--file', 'a', '--resume'],
  ['--file', 'a', '--output', 'jsonl'],
  ['--manifest', 'b', '--state', 'state.json'],
  ['--manifest', 'b', '--concurrency', '0'],
])('rejects incompatible batch flags %j', async (...args) => {
  const {error} = await testCommand(UploadAssetCommand, args, {mocks: defaultMocks})
  expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
})

test('prints readable batch statuses and returns normally on success', async () => {
  mockUploadAssetBatch.mockImplementation(async ({onResult}) => {
    onResult({key: 'hero', status: 'validated'})
    return true
  })
  const {error, stdout} = await testCommand(
    UploadAssetCommand,
    ['--manifest', './assets.json', '--dry-run'],
    {mocks: defaultMocks},
  )
  if (error) throw error
  expect(stdout).toBe('hero: validated\n')
})

test('reports manifest errors without starting a single-file upload', async () => {
  mockUploadAssetBatch.mockRejectedValue(
    new Error('Cannot read manifest. Use a readable JSON file.'),
  )
  const {error} = await testCommand(UploadAssetCommand, ['--manifest', './assets.json'], {
    mocks: defaultMocks,
  })
  expect(error?.message).toContain('Cannot read manifest')
  expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
})

test('redacts manifest and state paths from telemetry', () => {
  expect(
    parseArguments(
      [
        'node',
        'sanity',
        'assets',
        'upload',
        '--manifest=/private/assets.json',
        '--state=/private/state.json',
        '--resume',
      ],
      UploadAssetCommand.telemetry,
    ).extraArguments,
  ).toEqual(['--manifest', '--state', '--resume'])
})

test('rejects a batch-level asset type', async () => {
  const {error} = await testCommand(
    UploadAssetCommand,
    ['--manifest', './assets.json', '--type', 'file'],
    {mocks: defaultMocks},
  )
  expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
})
