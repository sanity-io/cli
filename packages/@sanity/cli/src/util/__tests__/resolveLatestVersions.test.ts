import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveLatestVersions} from '../resolveLatestVersions.js'

const mockGetLatestVersion = vi.hoisted(() => vi.fn())

vi.mock('get-latest-version', () => ({
  getLatestVersion: mockGetLatestVersion,
}))

describe('resolveLatestVersions', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('passes through valid semver ranges without looking them up', async () => {
    const result = await resolveLatestVersions({
      foo: '1.2.3',
      react: '^19.2.4',
      typescript: '~5.8',
    })

    expect(result).toEqual({
      foo: '1.2.3',
      react: '^19.2.4',
      typescript: '~5.8',
    })
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('resolves the `latest` dist-tag and caret-prefixes the version', async () => {
    mockGetLatestVersion.mockResolvedValueOnce('4.5.6')

    const result = await resolveLatestVersions({sanity: 'latest'})

    expect(mockGetLatestVersion).toHaveBeenCalledWith('sanity', {range: 'latest'})
    expect(result).toEqual({sanity: '^4.5.6'})
  })

  test('passes arbitrary dist-tags such as `workbench` through without resolving', async () => {
    const result = await resolveLatestVersions({sanity: 'workbench'})

    expect(mockGetLatestVersion).not.toHaveBeenCalled()
    expect(result).toEqual({sanity: 'workbench'})
  })

  test('resolves `latest` alongside pass-through ranges and dist-tags in a single call', async () => {
    mockGetLatestVersion.mockResolvedValueOnce('1.0.0')

    const result = await resolveLatestVersions({
      '@sanity/vision': 'latest',
      react: '^19.2.4',
      sanity: 'workbench',
    })

    expect(result).toEqual({
      '@sanity/vision': '^1.0.0',
      react: '^19.2.4',
      sanity: 'workbench',
    })
    expect(mockGetLatestVersion).toHaveBeenCalledTimes(1)
    expect(mockGetLatestVersion).toHaveBeenCalledWith('@sanity/vision', {range: 'latest'})
  })
})
