import {Readable} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {getGlobalCliClient} from '@sanity/cli-core'
import FormData from 'form-data'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  anInstallation,
  installationsResponse,
} from '../../actions/deploy/__tests__/fixtures/installations.js'
import {
  type ConfigSnapshot,
  createConfig,
  deleteConfig,
  listConfigs,
  resolveSingletonInstallationId,
} from '../installations.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

const mockClient = {request: vi.fn()}
// A gzip stream is opaque to the service; a readable stands in for the tarball.
const tarball = () => Readable.from(['config']) as unknown as Gzip

/** The (name, value, options) each `FormData.append` call provoked. */
function appended(): Array<[string, unknown, unknown]> {
  return appendSpy.mock.calls.map(
    (call: unknown[]) => [call[0], call[1], call[2]] as [string, unknown, unknown],
  )
}
let appendSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.mocked(getGlobalCliClient).mockResolvedValue(mockClient as never)
  appendSpy = vi.spyOn(FormData.prototype, 'append')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('resolveSingletonInstallationId', () => {
  test('requests every installation in one page and resolves the id matched on application.name', async () => {
    mockClient.request.mockResolvedValueOnce(
      installationsResponse([
        anInstallation({id: 'inst_studio', name: 'some-studio'}),
        anInstallation({id: 'inst_ml', name: 'media-library'}),
      ]),
    )

    expect(await resolveSingletonInstallationId('org-1', 'media-library')).toBe('inst_ml')
    expect(getGlobalCliClient).toHaveBeenCalledWith({apiVersion: 'vX', requireUser: true})
    expect(mockClient.request).toHaveBeenCalledWith({
      query: {limit: 'none', organizationId: 'org-1'},
      url: '/installations',
    })
  })

  test('matches application.name, not application.slug (the slug→name regression)', async () => {
    // name and slug are deliberately different; querying by the slug value must
    // NOT resolve — the resolver keys off name, so a silent flip back to slug
    // fails here. Declared inline so the check holds if fixture defaults change.
    mockClient.request.mockResolvedValueOnce(
      installationsResponse([
        anInstallation({application: {slug: 'media'}, id: 'inst_ml', name: 'media-library'}),
      ]),
    )
    expect(await resolveSingletonInstallationId('org-1', 'media')).toBeUndefined()
  })

  test('resolves undefined when no installation matches', async () => {
    mockClient.request.mockResolvedValueOnce(
      installationsResponse([anInstallation({id: 'inst_ml', name: 'media-library'})]),
    )
    expect(await resolveSingletonInstallationId('org-1', 'dashboard')).toBeUndefined()
  })
})

describe('createConfig', () => {
  test('POSTs the version and gzip tarball as multipart form-data to the installation', async () => {
    mockClient.request.mockResolvedValueOnce(undefined)

    await createConfig('inst_1', {tarball: tarball(), version: '1.2.3'})

    const post = mockClient.request.mock.calls[0][0]
    expect(post).toMatchObject({method: 'POST', url: '/installations/inst_1/configs'})
    // The multipart headers ride along with the streamed body, which must
    // actually be sent — an empty request would otherwise pass every other check.
    expect(post.headers['content-type']).toMatch(/^multipart\/form-data/)
    expect(post.body).toBeInstanceOf(Readable)

    expect(appended().find(([name]) => name === 'version')?.[1]).toBe('1.2.3')
    // The tarball part declares its gzip content-type and filename.
    expect(appended().find(([name]) => name === 'tarball')?.[2]).toMatchObject({
      contentType: 'application/gzip',
      filename: 'installation-config.tar.gz',
    })
  })
})

describe('listConfigs', () => {
  test('requests the installation’s snapshots in one page (limit=none)', async () => {
    const configs: ConfigSnapshot[] = [
      {createdAt: '2026-02-01T00:00:00.000Z', id: 'cfg_2', isActive: true},
      {createdAt: '2026-01-01T00:00:00.000Z', id: 'cfg_1'},
    ]
    mockClient.request.mockResolvedValueOnce({data: configs})

    expect(await listConfigs('inst_1')).toEqual(configs)
    expect(mockClient.request).toHaveBeenCalledWith({
      query: {limit: 'none'},
      url: '/installations/inst_1/configs',
    })
  })
})

describe('deleteConfig', () => {
  test('DELETEs the snapshot', async () => {
    mockClient.request.mockResolvedValueOnce(undefined)

    await deleteConfig('inst_1', 'cfg_1')

    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'DELETE',
      url: '/installations/inst_1/configs/cfg_1',
    })
  })

  test('swallows a 404 — already deleted counts as done', async () => {
    mockClient.request.mockRejectedValueOnce({statusCode: 404})
    await expect(deleteConfig('inst_1', 'cfg_1')).resolves.toBeUndefined()
  })

  test('rethrows a non-404', async () => {
    mockClient.request.mockRejectedValueOnce({statusCode: 500})
    await expect(deleteConfig('inst_1', 'cfg_1')).rejects.toMatchObject({statusCode: 500})
  })
})
