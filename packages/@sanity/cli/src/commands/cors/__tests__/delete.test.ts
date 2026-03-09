import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION, type CorsOrigin} from '../../../services/cors.js'
import {Delete} from '../delete.js'

const createCorsOrigin = (
  overrides: Partial<CorsOrigin> & {id: number; origin: string},
): CorsOrigin => ({
  allowCredentials: true,
  createdAt: '2023-01-01T00:00:00Z',
  deletedAt: null,
  projectId: 'test-project',
  updatedAt: null,
  ...overrides,
})

const TEST_ORIGINS = {
  APP_EXAMPLE: createCorsOrigin({
    allowCredentials: false,
    id: 2,
    origin: 'https://app.example.com',
  }),
  CASE_MIXED: createCorsOrigin({id: 1, origin: 'https://Example.Com'}),
  EXAMPLE: createCorsOrigin({id: 1, origin: 'https://example.com'}),
  LOCALHOST: createCorsOrigin({id: 1, origin: 'http://localhost:3000'}),
  SPECIAL_CHARS: createCorsOrigin({id: 1, origin: 'https://café.example.com'}),
} as const

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
  }
})

describe('#cors:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('deletes a specific CORS origin', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [TEST_ORIGINS.EXAMPLE, TEST_ORIGINS.APP_EXAMPLE])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/cors/1',
    }).reply(204)

    const {stdout} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(stdout).toBe('Origin deleted\n')
  })

  test('prompts user to select origin when none specified', async () => {
    const {select} = await import('@sanity/cli-core/ux')
    vi.mocked(select).mockResolvedValue(2)

    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [TEST_ORIGINS.EXAMPLE, TEST_ORIGINS.APP_EXAMPLE])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/cors/2',
    }).reply(204)

    const {stdout} = await testCommand(Delete, [], {mocks: defaultMocks})
    expect(stdout).toBe('Origin deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'https://example.com', value: 1},
        {name: 'https://app.example.com', value: 2},
      ],
      message: 'Select origin to delete',
    })
  })

  test('handles case-insensitive origin matching', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [TEST_ORIGINS.CASE_MIXED])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/cors/1',
    }).reply(204)

    const {stdout} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(stdout).toBe('Origin deleted\n')
  })

  test('throws error when specified origin is not found', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [TEST_ORIGINS.EXAMPLE])

    const {error} = await testCommand(Delete, ['https://nonexistent.com'], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual('Origin "https://nonexistent.com" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no CORS origins exist', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [])

    const {error} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual('No CORS origins configured for this project.')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'when fetching origins', message: 'Internal Server Error', statusCode: 500},
    {desc: 'with 404 error when fetching origins', message: 'Project not found', statusCode: 404},
  ])('handles API error $desc', async ({message, statusCode}) => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(statusCode, {message})

    const {error} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch CORS origins')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'when deleting origin', message: 'Failed to delete', statusCode: 500},
    {desc: 'with 404 error when deleting origin', message: 'Origin not found', statusCode: 404},
  ])('handles API error $desc', async ({message, statusCode}) => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [TEST_ORIGINS.EXAMPLE])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/cors/1',
    }).reply(statusCode, {message})

    const {error} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Origin deletion failed')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws error when $desc', async ({projectId}) => {
    const {error} = await testCommand(Delete, ['https://example.com'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId}},
      },
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network errors when fetching origins', async () => {
    // Don't set up any mock to simulate network failure
    const {error} = await testCommand(Delete, ['https://example.com'], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch CORS origins')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {
      desc: 'special characters',
      input: 'https://café.example.com',
      origin: TEST_ORIGINS.SPECIAL_CHARS,
    },
    {desc: 'ports', input: 'http://localhost:3000', origin: TEST_ORIGINS.LOCALHOST},
  ])('handles $desc in origin names', async ({input, origin}) => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: '/projects/test-project/cors',
    }).reply(200, [origin])

    mockApi({
      apiVersion: CORS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/cors/1',
    }).reply(204)

    const {stdout} = await testCommand(Delete, [input], {mocks: defaultMocks})
    expect(stdout).toBe('Origin deleted\n')
  })
})
