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

  test('resolves arbitrary dist-tags such as `workbench`', async () => {
    mockGetLatestVersion.mockResolvedValueOnce('7.8.9-workbench.0')

    const result = await resolveLatestVersions({sanity: 'workbench'})

    expect(mockGetLatestVersion).toHaveBeenCalledWith('sanity', {range: 'workbench'})
    expect(result).toEqual({sanity: '^7.8.9-workbench.0'})
  })

  test('falls back to the original tag when the lookup returns undefined', async () => {
    mockGetLatestVersion.mockResolvedValueOnce(undefined)

    const result = await resolveLatestVersions({sanity: 'workbench'})

    expect(result).toEqual({sanity: 'workbench'})
  })

  test('resolves a mix of ranges and dist-tags in a single call', async () => {
    mockGetLatestVersion.mockImplementation(async (_pkg: string, {range}: {range: string}) => {
      if (range === 'latest') return '1.0.0'
      if (range === 'workbench') return '2.0.0-workbench.1'
      return undefined
    })

    const result = await resolveLatestVersions({
      '@sanity/vision': 'latest',
      react: '^19.2.4',
      sanity: 'workbench',
    })

    expect(result).toEqual({
      '@sanity/vision': '^1.0.0',
      react: '^19.2.4',
      sanity: '^2.0.0-workbench.1',
    })
    expect(mockGetLatestVersion).toHaveBeenCalledTimes(2)
  })
})
