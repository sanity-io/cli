import {type CliConfig} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {AssetsUploadCommand} from '../upload.js'

// Hoist mocks
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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

  test('uploads a file and prints URL', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-image-data'))
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          document: {url: 'https://cdn.sanity.io/images/testproject/production/abc123.png'},
        }),
      ok: true,
    })

    const {stdout} = await testCommand(AssetsUploadCommand, ['test.png'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('https://cdn.sanity.io/images/testproject/production/abc123.png')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('assets/images/'),
      expect.objectContaining({method: 'POST'}),
    )
  })

  test('routes non-image files to files endpoint', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-pdf-data'))
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          document: {url: 'https://cdn.sanity.io/files/testproject/production/def456.pdf'},
        }),
      ok: true,
    })

    const {stdout} = await testCommand(AssetsUploadCommand, ['report.pdf'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('https://cdn.sanity.io/files/testproject/production/def456.pdf')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('assets/files/'),
      expect.objectContaining({method: 'POST'}),
    )
  })

  test('errors on API failure', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('fake-image-data'))
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })

    const {error} = await testCommand(AssetsUploadCommand, ['test.png'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('401')
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
})
