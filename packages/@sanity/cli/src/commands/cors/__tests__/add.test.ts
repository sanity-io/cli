import fs from 'node:fs'

import {confirm} from '@inquirer/prompts'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../../actions/cors/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Add} from '../add.js'

// Mock inquirer prompts
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Mock fs for file path detection tests
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}))

// Mock the config functions with relative paths
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

const mockConfirm = vi.mocked(confirm)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockExistsSync = vi.mocked(fs.existsSync)

describe('#cors:add', () => {
  beforeEach(() => {
    // Default mock implementations
    mockExistsSync.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('adds CORS origin with credentials flag', async () => {
    const expectedOrigin = {
      allowCredentials: true,
      createdAt: '2023-01-01T00:00:00Z',
      deletedAt: null,
      id: 1,
      origin: 'https://example.com',
      projectId: 'test-project',
      updatedAt: null,
    }

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, expectedOrigin)

    const {stdout} = await testCommand(Add, ['https://example.com', '--credentials'])

    expect(stdout).toContain('CORS origin added successfully')
  })

  test('adds CORS origin with no-credentials flag', async () => {
    const expectedOrigin = {
      allowCredentials: false,
      createdAt: '2023-01-01T00:00:00Z',
      deletedAt: null,
      id: 2,
      origin: 'http://localhost:3000',
      projectId: 'test-project',
      updatedAt: null,
    }

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, expectedOrigin)

    const {stdout} = await testCommand(Add, ['http://localhost:3000', '--no-credentials'])

    expect(stdout).toContain('CORS origin added successfully')
  })

  test('fails when no project ID is available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: {},
    })

    const {error} = await testCommand(Add, ['https://example.com'])

    expect(error?.message).toContain(NO_PROJECT_ID)
  })

  test('handles API errors gracefully', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(400, {message: 'Invalid origin'})

    const {error} = await testCommand(Add, ['https://example.com', '--credentials'])

    expect(error?.message).toContain('CORS origin addition failed')
  })

  test('warns when origin looks like a file path', async () => {
    mockExistsSync.mockReturnValue(true)

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, {})

    // Use a valid origin that also looks like a file path
    const {stderr} = await testCommand(Add, ['https://example.com', '--credentials'])

    expect(stderr).toContain('Remember to quote values')
  })

  test('shows normalized origin when filtering changes the origin', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, {})

    const {stdout} = await testCommand(Add, ['https://example.com:443', '--credentials'])

    expect(stdout).toContain('Normalized origin to: https://example.com')
    expect(stdout).toContain('CORS origin added successfully')
  })

  describe('wildcard origins', () => {
    test('prompts for confirmation with wildcard origins', async () => {
      mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {stdout} = await testCommand(Add, ['https://*.example.com'])

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          default: false,
          message: expect.stringContaining('absolutely sure'),
        }),
      )
      expect(stdout).toContain('CORS origin added successfully')
    })

    test('cancels operation when wildcard confirmation is denied', async () => {
      mockConfirm.mockResolvedValueOnce(false)

      const {error} = await testCommand(Add, ['https://*.example.com'])

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          default: false,
          message: expect.stringContaining('absolutely sure'),
        }),
      )
      expect(error?.message).toContain('Operation cancelled')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('shows specific examples for full wildcard', async () => {
      mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {stdout} = await testCommand(Add, ['*'])

      expect(stdout).toContain('http://www.some-malicious.site')
      expect(stdout).toContain('https://not.what-you-were-expecting.com')
    })
  })

  describe('credentials prompts', () => {
    test('prompts for credentials when flag not provided', async () => {
      mockConfirm.mockResolvedValueOnce(true)

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {stdout} = await testCommand(Add, ['https://example.com'])

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          default: false,
          message: expect.stringContaining('Allow credentials'),
        }),
      )
      expect(stdout).toContain('CORS origin added successfully')
    })

    test('shows warning about wildcard credentials', async () => {
      mockConfirm
        .mockResolvedValueOnce(true) // Confirm wildcard
        .mockResolvedValueOnce(false) // Deny credentials

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {stdout} = await testCommand(Add, ['https://*.example.com'])

      expect(stdout).toContain('HIGHLY')
      expect(stdout).toContain('recommend NOT allowing credentials')
      expect(stdout).toContain('on origins containing wildcards')
    })
  })

  describe('origin validation and filtering', () => {
    const validNonWildcardOrigins = [
      'https://example.com',
      'http://localhost:3000',
      'https://sub.example.com:8080',
      'null',
    ]

    const validWildcardOrigins = ['https://*.example.com', '*', 'file:///*']

    test.each(validNonWildcardOrigins)('accepts valid non-wildcard origin: %s', async (origin) => {
      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {error, stdout} = await testCommand(Add, [origin, '--credentials'])

      expect(error).toBeUndefined()
      expect(stdout).toContain('CORS origin added successfully')
    })

    test.each(validWildcardOrigins)('accepts valid wildcard origin: %s', async (origin) => {
      mockConfirm.mockResolvedValueOnce(true)

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {error, stdout} = await testCommand(Add, [origin, '--credentials'])

      expect(error).toBeUndefined()
      expect(stdout).toContain('CORS origin added successfully')
    })

    const invalidOrigins = [
      'not-a-url',
      'example.com', // missing protocol
    ]

    test.each(invalidOrigins)('rejects invalid origin: %s', async (origin) => {
      const {error} = await testCommand(Add, [origin, '--credentials'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('Invalid origin')
      expect(error?.oclif?.exit).toBe(1)
    })

    const portNormalizationCases = [
      {
        description: 'normalizes HTTPS default port',
        expectedOutput: 'Normalized origin to: https://example.com',
        input: 'https://example.com:443',
        shouldNormalize: true,
      },
      {
        description: 'normalizes HTTP default port',
        expectedOutput: 'Normalized origin to: http://example.com',
        input: 'http://example.com:80',
        shouldNormalize: true,
      },
      {
        description: 'preserves non-default ports',
        expectedOutput: 'CORS origin added successfully',
        input: 'https://example.com:8080',
        shouldNormalize: false,
      },
    ]

    test.each(portNormalizationCases)(
      '$description',
      async ({expectedOutput, input, shouldNormalize}) => {
        mockApi({
          apiVersion: CORS_API_VERSION,
          method: 'post',
          uri: '/projects/test-project/cors',
        }).reply(201, {})

        const {stdout} = await testCommand(Add, [input, '--credentials'])

        if (shouldNormalize) {
          expect(stdout).toContain(expectedOutput)
        } else {
          expect(stdout).not.toContain('Normalized origin')
          expect(stdout).toContain(expectedOutput)
        }
      },
    )
  })

  describe('edge cases', () => {
    test('handles file system check errors gracefully', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).reply(201, {})

      const {stdout} = await testCommand(Add, ['https://example.com', '--credentials'])

      expect(stdout).toContain('CORS origin added successfully')
    })

    test('handles network errors during API call', async () => {
      mockApi({
        apiVersion: CORS_API_VERSION,
        method: 'post',
        uri: '/projects/test-project/cors',
      }).replyWithError(new Error('Network Error'))

      const {error} = await testCommand(Add, ['https://example.com', '--credentials'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('CORS origin addition failed')
      expect(error?.message).toContain('Network Error')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
