import {afterEach, describe, expect, test, vi} from 'vitest'

const mockGetLatestVersion = vi.hoisted(() => Object.assign(vi.fn(), {request: vi.fn()}))

vi.mock('get-latest-version', () => ({
  getLatestVersion: mockGetLatestVersion,
}))

const {distTagsUrl, fetchLatestVersion} = await import('../fetchLatestVersion.js')

/** Mirrors how get-latest-version reads a registry response */
async function resolveWith(
  options: {
    request?: (options: {
      headers: Record<string, string>
      url: string
    }) => Promise<{body: {'dist-tags': Record<string, string>}}>
  },
  url: string,
) {
  const {body} = await options.request!({headers: {authorization: 'Bearer token'}, url})
  return body['dist-tags'].latest
}

describe('distTagsUrl', () => {
  test.each([
    ['https://registry.npmjs.org/sanity', 'https://registry.npmjs.org/-/package/sanity/dist-tags'],
    [
      'https://registry.npmjs.org/@sanity%2Fcli',
      'https://registry.npmjs.org/-/package/@sanity%2Fcli/dist-tags',
    ],
    [
      'https://example.com/api/npm/repo/@sanity%2Fcli',
      'https://example.com/api/npm/repo/-/package/@sanity%2Fcli/dist-tags',
    ],
  ])('%s', (input, expected) => {
    expect(distTagsUrl(input)).toBe(expected)
  })
})

describe('fetchLatestVersion', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('reads the latest version from the dist-tags document', async () => {
    mockGetLatestVersion.request.mockResolvedValue({body: {latest: '8.14.0', next: '9.0.0-0'}})
    mockGetLatestVersion.mockImplementation((_name, options) =>
      resolveWith(options, 'https://registry.npmjs.org/@sanity%2Fcli'),
    )

    await expect(fetchLatestVersion('@sanity/cli')).resolves.toBe('8.14.0')
    expect(mockGetLatestVersion).toHaveBeenCalledOnce()
    expect(mockGetLatestVersion.request).toHaveBeenCalledWith({
      headers: {authorization: 'Bearer token'},
      url: 'https://registry.npmjs.org/-/package/@sanity%2Fcli/dist-tags',
    })
  })

  test('reads the package document when dist-tags are unavailable', async () => {
    mockGetLatestVersion
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce('8.14.0')

    await expect(fetchLatestVersion('@sanity/cli')).resolves.toBe('8.14.0')
    expect(mockGetLatestVersion).toHaveBeenLastCalledWith('@sanity/cli')
  })

  test('reads the package document when dist-tags have no latest version', async () => {
    mockGetLatestVersion.mockResolvedValueOnce(undefined).mockResolvedValueOnce('8.14.0')

    await expect(fetchLatestVersion('sanity')).resolves.toBe('8.14.0')
    expect(mockGetLatestVersion).toHaveBeenCalledTimes(2)
  })
})
