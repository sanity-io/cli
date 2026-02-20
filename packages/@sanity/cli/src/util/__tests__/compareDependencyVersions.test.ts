import {beforeEach, describe, expect, it, vi} from 'vitest'

import {compareDependencyVersions} from '../compareDependencyVersions'

const mockReadPackageJson = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
vi.mock('../../util/getLocalPackageVersion.js', () => ({
  getLocalPackageVersion: mockGetLocalPackageVersion,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    readPackageJson: mockReadPackageJson,
  }
})

const autoUpdatePackages = [
  {name: 'sanity', version: '1.0.0'},
  {name: '@sanity/vision', version: '1.0.0'},
]

const appAutoUpdatePackages = [
  {name: '@sanity/sdk-react', version: '1.0.0'},
  {name: '@sanity/sdk', version: '1.0.0'},
]

/** Helper to call compareDependencyVersions with the mock requester injected */
function compare(
  packages: {name: string; version: string}[],
  workDir: string,
  options: {appId?: string} = {},
) {
  return compareDependencyVersions(packages, workDir, {
    ...options,
    requester: mockRequest as never,
  })
}

describe('compareDependencyVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  describe('for studio', () => {
    it('should return empty mismatched array if versions match', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValue('3.40.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/vision': '^3.40.0',
            sanity: '^3.40.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: 'sanity',
          version: '3.40.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/vision',
          version: '3.40.0',
        })

      const result = await compare(autoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([])
      expect(result.unresolvedPrerelease).toEqual([])
    })

    it('should return one item in mismatched array if versions mismatches for one pkg', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.30.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.40.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/vision': '^3.40.0',
            sanity: '^3.40.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: 'sanity',
          version: '3.30.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/vision',
          version: '3.40.0',
        })

      const result = await compare(autoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '3.30.0',
          pkg: 'sanity',
          remote: '3.40.0',
        },
      ])
    })
    it('should return multiple items in mismatched array if versions mismatches for more pkg', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.30.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.30.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/vision': '^3.40.0',
            sanity: '^3.40.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: 'sanity',
          version: '3.30.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/vision',
          version: '3.30.0',
        })

      const result = await compare(autoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '3.30.0',
          pkg: 'sanity',
          remote: '3.40.0',
        },
        {
          installed: '3.30.0',
          pkg: '@sanity/vision',
          remote: '3.40.0',
        },
      ])
    })

    it("should warn if the user's package.json version is greater then remote", async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.50.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.40.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/vision': '^3.40.0',
            sanity: '^3.40.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: 'sanity',
          version: '3.50.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/vision',
          version: '3.40.0',
        })

      const result = await compare(autoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '3.50.0',
          pkg: 'sanity',
          remote: '3.40.0',
        },
      ])
    })

    it("should read from user's package.json if resolveFrom fails to find package.json in node_modules", async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.20.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('3.20.0')
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {
          '@sanity/vision': '^3.20.0',
          sanity: '^3.20.0',
        },
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      const result = await compare(autoUpdatePackages, '/test/workdir')

      expect(mockReadPackageJson).toHaveBeenCalledTimes(1)

      expect(result.mismatched).toEqual([
        {
          installed: '3.20.0',
          pkg: 'sanity',
          remote: '3.40.0',
        },
        {
          installed: '3.20.0',
          pkg: '@sanity/vision',
          remote: '3.40.0',
        },
      ])
    })
  })

  describe('for app', () => {
    it('should return empty mismatched array if versions match', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '0.1.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.1.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.1.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/sdk': '^0.1.0',
            '@sanity/sdk-react': '^0.1.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk-react',
          version: '0.1.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk',
          version: '0.1.0',
        })

      const result = await compare(appAutoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([])
      expect(result.unresolvedPrerelease).toEqual([])
    })

    it('should return one item in mismatched array if versions mismatches for one pkg', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '0.1.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.0.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.1.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/sdk': '^0.1.0',
            '@sanity/sdk-react': '^0.1.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk-react',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk',
          version: '0.1.0',
        })

      const result = await compare(appAutoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '0.0.0',
          pkg: '@sanity/sdk-react',
          remote: '0.1.0',
        },
      ])
    })
    it('should return multiple items in mismatched array if versions mismatches for more pkg', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '0.2.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.1.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.1.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/sdk': '^0.1.0',
            '@sanity/sdk-react': '^0.1.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk-react',
          version: '0.1.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk',
          version: '0.1.0',
        })

      const result = await compare(appAutoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '0.1.0',
          pkg: '@sanity/sdk-react',
          remote: '0.2.0',
        },
        {
          installed: '0.1.0',
          pkg: '@sanity/sdk',
          remote: '0.2.0',
        },
      ])
    })

    it("should warn if the user's package.json version is greater then remote", async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '0.1.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.2.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.2.0')
      mockReadPackageJson
        .mockResolvedValueOnce({
          dependencies: {
            '@sanity/sdk': '^0.1.0',
            '@sanity/sdk-react': '^0.1.0',
          },
          devDependencies: {},
          name: 'test-package',
          version: '0.0.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk-react',
          version: '0.2.0',
        })
        .mockResolvedValueOnce({
          dependencies: {},
          devDependencies: {},
          name: '@sanity/sdk',
          version: '0.2.0',
        })

      const result = await compare(appAutoUpdatePackages, '/test/workdir')

      expect(result.mismatched).toEqual([
        {
          installed: '0.2.0',
          pkg: '@sanity/sdk-react',
          remote: '0.1.0',
        },
        {
          installed: '0.2.0',
          pkg: '@sanity/sdk',
          remote: '0.1.0',
        },
      ])
    })

    it("should read from user's package.json if resolveFrom fails to find package.json in node_modules", async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '0.1.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.0.0')
      mockGetLocalPackageVersion.mockResolvedValueOnce('0.0.0')
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {
          '@sanity/sdk': '^0.0.0',
          '@sanity/sdk-react': '^0.0.0',
        },
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      const result = await compare(appAutoUpdatePackages, '/test/workdir')

      expect(mockReadPackageJson).toHaveBeenCalledTimes(1)

      expect(result.mismatched).toEqual([
        {
          installed: '0.0.0',
          pkg: '@sanity/sdk-react',
          remote: '0.1.0',
        },
        {
          installed: '0.0.0',
          pkg: '@sanity/sdk',
          remote: '0.1.0',
        },
      ])
    })
  })

  describe('error handling', () => {
    it('should throw with URL context when request fails with a network error', async () => {
      mockRequest.mockRejectedValue(new Error('getaddrinfo ENOTFOUND modules.sanity.io'))
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await expect(
        compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir'),
      ).rejects.toThrow(/Failed to fetch remote version for .+: getaddrinfo ENOTFOUND/)
    })

    it("should throw when response is missing the 'x-resolved-version' header", async () => {
      mockRequest.mockResolvedValue({
        headers: {},
        statusCode: 302,
      })
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await expect(
        compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir'),
      ).rejects.toThrow("Missing 'x-resolved-version' header")
    })

    it('should throw when response has an unexpected HTTP status code', async () => {
      mockRequest.mockResolvedValue({
        headers: {},
        statusCode: 500,
        statusMessage: 'Internal Server Error',
      })
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await expect(
        compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir'),
      ).rejects.toThrow('Unexpected HTTP response: 500 Internal Server Error')
    })
  })

  describe('module URL selection', () => {
    it('should use the default module endpoint when no appId is provided', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValue('3.40.0')
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir')

      const url = mockRequest.mock.calls[0][0].url as string
      expect(url).toContain('/v1/modules/sanity/default/')
      expect(url).not.toContain('/by-app/')
    })

    it('should use the app-specific module endpoint when appId is provided', async () => {
      mockRequest.mockResolvedValue({
        headers: {'x-resolved-version': '3.40.0'},
        statusCode: 302,
      })
      mockGetLocalPackageVersion.mockResolvedValue('3.40.0')
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir', {
        appId: 'my-app-id',
      })

      const url = mockRequest.mock.calls[0][0].url as string
      expect(url).toContain('/v1/modules/by-app/my-app-id/')
      expect(url).not.toContain('/default/')
    })
  })

  describe('prerelease version handling', () => {
    it('should return prerelease package in unresolvedPrerelease when remote returns 404', async () => {
      mockRequest.mockResolvedValue({
        headers: {},
        statusCode: 404,
        statusMessage: 'Not Found',
      })
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^5.11.1-alpha.14'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      const result = await compare(
        [{name: 'sanity', version: '5.11.1-alpha.14'}],
        '/test/workdir',
      )

      expect(result.mismatched).toEqual([])
      expect(result.unresolvedPrerelease).toEqual([
        {pkg: 'sanity', version: '5.11.1-alpha.14'},
      ])
    })

    it('should throw for non-prerelease package when remote returns 404', async () => {
      mockRequest.mockResolvedValue({
        headers: {},
        statusCode: 404,
        statusMessage: 'Not Found',
      })
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {sanity: '^3.40.0'},
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      await expect(
        compare([{name: 'sanity', version: '3.40.0'}], '/test/workdir'),
      ).rejects.toThrow('Failed to resolve remote version for sanity@3.40.0: package not found')
    })

    it('should correctly split resolvable and prerelease packages', async () => {
      // First call (sanity with prerelease) returns 404
      // Second call (@sanity/vision with normal version) returns resolved version
      mockRequest
        .mockResolvedValueOnce({
          headers: {},
          statusCode: 404,
          statusMessage: 'Not Found',
        })
        .mockResolvedValueOnce({
          headers: {'x-resolved-version': '3.40.0'},
          statusCode: 302,
        })

      mockGetLocalPackageVersion.mockResolvedValueOnce('3.30.0')
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {
          '@sanity/vision': '^3.40.0',
          sanity: '^5.11.1-alpha.14',
        },
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      const result = await compare(
        [
          {name: 'sanity', version: '5.11.1-alpha.14'},
          {name: '@sanity/vision', version: '3.40.0'},
        ],
        '/test/workdir',
      )

      expect(result.unresolvedPrerelease).toEqual([
        {pkg: 'sanity', version: '5.11.1-alpha.14'},
      ])
      expect(result.mismatched).toEqual([
        {
          installed: '3.30.0',
          pkg: '@sanity/vision',
          remote: '3.40.0',
        },
      ])
    })

    it('should handle multiple prerelease packages with 404', async () => {
      mockRequest.mockResolvedValue({
        headers: {},
        statusCode: 404,
        statusMessage: 'Not Found',
      })
      mockReadPackageJson.mockResolvedValueOnce({
        dependencies: {
          '@sanity/vision': '^5.11.1-beta.1',
          sanity: '^5.11.1-alpha.14',
        },
        devDependencies: {},
        name: 'test-package',
        version: '0.0.0',
      })

      const result = await compare(
        [
          {name: 'sanity', version: '5.11.1-alpha.14'},
          {name: '@sanity/vision', version: '5.11.1-beta.1'},
        ],
        '/test/workdir',
      )

      expect(result.mismatched).toEqual([])
      expect(result.unresolvedPrerelease).toEqual([
        {pkg: 'sanity', version: '5.11.1-alpha.14'},
        {pkg: '@sanity/vision', version: '5.11.1-beta.1'},
      ])
    })
  })
})
