import {type CliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetsUploadCommand} from '../upload.js'

// Hoist mocks
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      assets: {
        upload: mocks.upload,
      } as never,
    }),
  }
})

const defaultMocks = {
  cliConfig: {
    api: {dataset: 'production', projectId: 'testproject'} as CliConfig['api'],
  },
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    root: '/test/path',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#assets:upload', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uploads an image and prints URL', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-image-data'))
    mocks.upload.mockResolvedValueOnce({
      _id: 'image-abc123',
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/testproject/production/abc123.png',
    })

    const {stdout} = await testCommand(AssetsUploadCommand, ['test.png'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('https://cdn.sanity.io/images/testproject/production/abc123.png')
    expect(mocks.upload).toHaveBeenCalledWith('image', expect.any(Buffer), {filename: 'test.png'})
  })

  test('routes non-image files as file asset type', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-pdf-data'))
    mocks.upload.mockResolvedValueOnce({
      _id: 'file-def456',
      _type: 'sanity.fileAsset',
      url: 'https://cdn.sanity.io/files/testproject/production/def456.pdf',
    })

    const {stdout} = await testCommand(AssetsUploadCommand, ['report.pdf'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('https://cdn.sanity.io/files/testproject/production/def456.pdf')
    expect(mocks.upload).toHaveBeenCalledWith('file', expect.any(Buffer), {filename: 'report.pdf'})
  })

  test('errors on upload failure', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-image-data'))
    mocks.upload.mockRejectedValueOnce(new Error('Upload failed: 401 Unauthorized'))

    const {error} = await testCommand(AssetsUploadCommand, ['test.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Upload failed')
  })

  test('errors when no project ID is found', async () => {
    const {error} = await testCommand(AssetsUploadCommand, ['test.png'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {} as CliConfig['api']},
      },
    })

    expect(error?.message).toContain('No project ID found')
  })

  test('errors when file cannot be read', async () => {
    mocks.readFile.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file or directory'), {code: 'ENOENT'}),
    )

    const {error} = await testCommand(AssetsUploadCommand, ['missing.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Cannot read missing.png')
    expect(error?.message).toContain('ENOENT')
  })
})
