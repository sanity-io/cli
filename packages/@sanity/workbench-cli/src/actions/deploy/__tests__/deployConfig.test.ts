import {Readable} from 'node:stream'

import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deployConfig, resolveInstallationId, summarizeConfig} from '../deployConfig.js'

const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getGlobalCliClient: mockGetGlobalCliClient,
}))

// The tarball content is irrelevant here — stub a readable so no build output
// has to exist on disk.
vi.mock('modern-tar/fs', () => ({packTar: () => Readable.from(['remote'])}))

const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

/** Answer the installations list with `data`, and the config POST with a record. */
function stubBrett(data: unknown[]) {
  mockRequest.mockImplementation(async ({method, uri}) => {
    if (uri === '/installations' && (!method || method === 'GET')) return {data}
    if (method === 'POST') return {id: 'cfg_1', installationId: 'inst_1', isActive: true}
    throw new Error(`unexpected request to ${uri}`)
  })
}

describe('resolveInstallationId', () => {
  beforeEach(() => mockGetGlobalCliClient.mockResolvedValue({request: mockRequest}))
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('resolves the org media-library installation in one unpaginated request', async () => {
    stubBrett([
      {application: {slug: 'some-studio'}, id: 'inst_studio'},
      {application: {slug: 'media-library'}, id: 'inst_ml'},
    ])

    const id = await resolveInstallationId({appType: 'media-library', organizationId: 'org-1'})

    expect(id).toBe('inst_ml')
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {limit: 'none', organizationId: 'org-1'},
        uri: '/installations',
      }),
    )
  })

  test('returns undefined when the org has no media-library installation', async () => {
    stubBrett([{application: {slug: 'dashboard'}, id: 'inst_a'}])
    expect(
      await resolveInstallationId({appType: 'media-library', organizationId: 'org-1'}),
    ).toBeUndefined()
  })

  test('throws for an app type with no resolver', async () => {
    await expect(
      resolveInstallationId({appType: 'canvas', organizationId: 'org-1'}),
    ).rejects.toThrow(/unknown app type: canvas/)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

describe('deployConfig', () => {
  beforeEach(() => mockGetGlobalCliClient.mockResolvedValue({request: mockRequest}))
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('POSTs the tarball to the installation as a session-token multipart upload', async () => {
    stubBrett([])

    await deployConfig({
      appType: 'media-library',
      installationId: 'inst_ml',
      output,
      sourceDir: '/tmp/build/app',
      version: '3.99.0',
    })

    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({requireUser: true}),
    )
    const post = mockRequest.mock.calls.find(([arg]) => arg.method === 'POST')?.[0]
    expect(post.uri).toBe('/installations/inst_ml/configs')
    expect(post.headers['content-type']).toMatch(/multipart\/form-data/)
  })
})

describe('summarizeConfig', () => {
  test('lists a media library config as a heading with title/name per field', () => {
    expect(
      summarizeConfig({
        appType: 'media-library',
        fields: [
          {name: 'title', title: 'Title'},
          {name: 'author', title: 'Author'},
        ],
      }),
    ).toBe('Media library fields:\n  Title (title)\n  Author (author)')
  })

  test('throws for an unhandled app type', () => {
    expect(() => summarizeConfig({appType: 'canvas', fields: []})).toThrow(
      /unknown app type: canvas/,
    )
  })
})
