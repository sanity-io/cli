import fs from 'node:fs'

import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../../services/cors.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Add} from '../add.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
  }
})

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}))

const defaultMocks = {
  cliConfig: {api: {projectId: 'test-project'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockConfirm = vi.mocked(confirm)
const mockExistsSync = vi.mocked(fs.existsSync)

const setupSuccessfulApiMock = () => {
  return mockApi({
    apiVersion: CORS_API_VERSION,
    method: 'post',
    uri: '/projects/test-project/cors',
  }).reply(201, {
    allowCredentials: true,
    createdAt: '2023-01-01T00:00:00Z',
    deletedAt: null,
    id: 1,
    origin: 'https://example.com',
    projectId: 'test-project',
    updatedAt: null,
  })
}

describe('#cors:add', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('adds CORS origin with credentials flag', async () => {
    const origin = 'https://example.com'
    const expectedAllowCredentials = true

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, function (_, requestBody) {
      expect(requestBody).toEqual({
        allowCredentials: expectedAllowCredentials,
        origin: origin,
      })

      return {
        allowCredentials: expectedAllowCredentials,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 1,
        origin: origin,
        projectId: 'test-project',
        updatedAt: null,
      }
    })

    const {stdout} = await testCommand(Add, [origin, '--credentials'], {mocks: defaultMocks})

    expect(stdout).toContain('CORS origin added successfully')
  })

  test('adds CORS origin with no-credentials flag', async () => {
    const origin = 'http://localhost:3000'
    const expectedAllowCredentials = false

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/cors',
    }).reply(201, function (_, requestBody) {
      expect(requestBody).toEqual({
        allowCredentials: expectedAllowCredentials,
        origin: origin,
      })

      return {
        allowCredentials: expectedAllowCredentials,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 2,
        origin: origin,
        projectId: 'test-project',
        updatedAt: null,
      }
    })

    const {stdout} = await testCommand(Add, [origin, '--no-credentials'], {mocks: defaultMocks})

    expect(stdout).toContain('CORS origin added successfully')
  })

  test('fails when no project ID is available', async () => {
    const {error} = await testCommand(Add, ['https://example.com'], {
      mocks: {
        cliConfig: {api: {}},
        projectRoot: {
          directory: '/test/path',
          path: '/test/path/sanity.config.ts',
          type: 'studio' as const,
        },
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
  })

  const errorHandlingCases = [
    {
      description: 'handles API errors gracefully',
      expectedError: 'CORS origin addition failed',
      setupMock: () =>
        mockApi({
          apiVersion: CORS_API_VERSION,
          method: 'post',
          uri: '/projects/test-project/cors',
        }).reply(400, {message: 'Invalid origin'}),
    },
    {
      description: 'handles network errors during API call',
      expectedError: 'CORS origin addition failed',
      setupMock: () =>
        mockApi({
          apiVersion: CORS_API_VERSION,
          method: 'post',
          uri: '/projects/test-project/cors',
        }).replyWithError(new Error('Network Error')),
    },
  ]

  test.each(errorHandlingCases)('$description', async ({expectedError, setupMock}) => {
    setupMock()

    const {error} = await testCommand(Add, ['https://example.com', '--credentials'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('warns when origin looks like a file path', async () => {
    mockExistsSync.mockReturnValue(true)
    setupSuccessfulApiMock()

    const {stderr} = await testCommand(Add, ['https://example.com', '--credentials'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('Remember to quote values')
  })

  describe('wildcard origins', () => {
    const wildcardConfirmationCases = [
      {
        confirmWildcard: true,
        description: 'prompts for confirmation with wildcard origins and proceeds',
        expectedError: undefined,
        expectedOutput: 'CORS origin added successfully',
        setupMocks: () => {
          mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
          setupSuccessfulApiMock()
        },
      },
      {
        confirmWildcard: false,
        description: 'cancels operation when wildcard confirmation is denied',
        expectedError: 'Operation cancelled',
        expectedOutput: undefined,
        setupMocks: () => mockConfirm.mockResolvedValueOnce(false),
      },
    ]

    test.each(wildcardConfirmationCases)(
      '$description',
      async ({expectedError, expectedOutput, setupMocks}) => {
        setupMocks()

        const result = await testCommand(Add, ['https://*.example.com'], {mocks: defaultMocks})

        expect(confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            default: false,
            message: expect.stringContaining('absolutely sure'),
          }),
        )

        if (expectedOutput) {
          expect(result.stdout).toContain(expectedOutput)
        }
        if (expectedError) {
          expect(result.error?.message).toContain(expectedError)
          expect(result.error?.oclif?.exit).toBe(1)
        }
      },
    )

    test('shows specific examples for full wildcard', async () => {
      mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      setupSuccessfulApiMock()

      const {stdout} = await testCommand(Add, ['*'], {mocks: defaultMocks})

      expect(stdout).toContain('http://www.some-malicious.site')
      expect(stdout).toContain('https://not.what-you-were-expecting.com')
    })
  })

  describe('credentials prompts', () => {
    test('prompts for credentials when flag not provided', async () => {
      mockConfirm.mockResolvedValueOnce(true)
      setupSuccessfulApiMock()

      const {stdout} = await testCommand(Add, ['https://example.com'], {mocks: defaultMocks})

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
      setupSuccessfulApiMock()

      const {stdout} = await testCommand(Add, ['https://*.example.com'], {mocks: defaultMocks})

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
      setupSuccessfulApiMock()

      const {error, stdout} = await testCommand(Add, [origin, '--credentials'], {
        mocks: defaultMocks,
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('CORS origin added successfully')
    })

    test.each(validWildcardOrigins)('accepts valid wildcard origin: %s', async (origin) => {
      mockConfirm.mockResolvedValueOnce(true)
      setupSuccessfulApiMock()

      const {error, stdout} = await testCommand(Add, [origin, '--credentials'], {
        mocks: defaultMocks,
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('CORS origin added successfully')
    })

    const invalidOrigins = [
      'not-a-url',
      'example.com', // missing protocol
    ]

    test.each(invalidOrigins)('rejects invalid origin: %s', async (origin) => {
      const {error} = await testCommand(Add, [origin, '--credentials'], {mocks: defaultMocks})

      expect(error).toBeDefined()
      expect(error?.message).toContain('Invalid origin')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('rejects file:// origins other than file:///*', async () => {
      const {error} = await testCommand(Add, ['file://localhost/path', '--credentials'], {
        mocks: defaultMocks,
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Only a local file wildcard is currently allowed: file:///*')
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
        setupSuccessfulApiMock()

        const {stdout} = await testCommand(Add, [input, '--credentials'], {mocks: defaultMocks})

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
      setupSuccessfulApiMock()

      const {stdout} = await testCommand(Add, ['https://example.com', '--credentials'], {
        mocks: defaultMocks,
      })

      expect(stdout).toContain('CORS origin added successfully')
    })
  })
})
