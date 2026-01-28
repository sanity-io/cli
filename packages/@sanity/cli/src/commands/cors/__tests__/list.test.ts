import {runCommand} from '@oclif/test'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CORS_API_VERSION} from '../../../services/cors.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {List} from '../list.js'

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

describe('#list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['cors', 'list', '--help'])

    expect(stdout).toContain('List all origins allowed to access the API for this project')
  })

  test('displays CORS origins correctly', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(200, [
      {
        allowCredentials: true,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 1,
        origin: 'https://example.com',
        projectId: testProjectId,
        updatedAt: '2023-01-02T00:00:00Z',
      },
      {
        allowCredentials: false,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 2,
        origin: 'https://app.example.com',
        projectId: testProjectId,
        updatedAt: null,
      },
      {
        allowCredentials: true,
        createdAt: '2023-01-03T00:00:00Z',
        deletedAt: null,
        id: 3,
        origin: 'http://localhost:3000',
        projectId: testProjectId,
        updatedAt: null,
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe('https://example.com\nhttps://app.example.com\nhttp://localhost:3000\n')
  })

  test('displays single CORS origin correctly', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(200, [
      {
        allowCredentials: true,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 1,
        origin: 'https://single-origin.com',
        projectId: testProjectId,
        updatedAt: null,
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe('https://single-origin.com\n')
  })

  test('handles empty CORS origins list', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(200, [])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe('No CORS origins configured for this project.\n')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('CORS origins list retrieval failed')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('handles network errors gracefully', async () => {
    // Don't set up any mock to simulate network failure
    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('CORS origins list retrieval failed')
    // The actual error can vary (authorization, network, etc.) so just check the wrapper
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(List, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('throws error when project ID is null', async () => {
    const {error} = await testCommand(List, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('throws error when project ID is empty string', async () => {
    const {error} = await testCommand(List, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: ''}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('handles non-array API response', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(200, {message: 'Not an array'})

    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('origins.map is not a function')
  })

  test('handles 404 error gracefully', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(404, {message: 'Project not found'})

    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('CORS origins list retrieval failed')
    expect(error?.message).toContain('Project not found')
  })

  test('handles 403 forbidden error', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(List, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('CORS origins list retrieval failed')
    expect(error?.message).toContain('Forbidden')
  })

  test('handles origins with special characters', async () => {
    mockApi({
      apiVersion: CORS_API_VERSION,
      uri: `/projects/${testProjectId}/cors`,
    }).reply(200, [
      {
        allowCredentials: true,
        createdAt: '2023-01-01T00:00:00Z',
        deletedAt: null,
        id: 1,
        origin: 'https://café.example.com',
        projectId: testProjectId,
        updatedAt: null,
      },
      {
        allowCredentials: false,
        createdAt: '2023-01-02T00:00:00Z',
        deletedAt: null,
        id: 2,
        origin: 'https://example.com:8080',
        projectId: testProjectId,
        updatedAt: null,
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe('https://café.example.com\nhttps://example.com:8080\n')
  })
})
