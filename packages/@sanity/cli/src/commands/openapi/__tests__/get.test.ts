import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GetOpenApiCommand} from '../get.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('open')

const mockYamlSpec = `
openapi: 3.0.0
info:
  title: Query API
  version: 1.0.0
paths:
  /query:
    get:
      summary: Query documents
`.trim()

const mockJsonSpec = JSON.stringify({
  info: {
    title: 'Query API',
    version: '1.0.0',
  },
  openapi: '3.0.0',
  paths: {
    '/query': {
      get: {
        summary: 'Query documents',
      },
    },
  },
})

describe('#openapi:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('gets YAML spec by default', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    await GetOpenApiCommand.run(['query'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining(mockYamlSpec))
  })

  test('gets JSON spec with --format=json', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'json'})
      .reply(200, mockJsonSpec, {'Content-Type': 'application/json'})

    await GetOpenApiCommand.run(['query', '--format=json'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining(mockJsonSpec))
  })

  test('gets YAML spec with explicit --format=yaml', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    await GetOpenApiCommand.run(['query', '--format=yaml'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining(mockYamlSpec))
  })

  test('opens web browser with --web flag', async () => {
    await GetOpenApiCommand.run(['query', '--web'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/docs/http-reference/query'),
    )
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/query')
  })

  test('handles 404 not found', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/nonexistent')
      .query({format: 'yaml'})
      .reply(404, 'Not Found')

    await GetOpenApiCommand.run(['nonexistent'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'OpenAPI specification not found. nonexistent',
      {exit: 1},
    )
  })

  test('handles server error', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(500, 'Server Error')

    await GetOpenApiCommand.run(['query'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'The OpenAPI service is currently unavailable. Please try again later.',
      {exit: 1},
    )
  })

  test('handles network error', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .replyWithError('Network error')

    await GetOpenApiCommand.run(['query'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      'The OpenAPI service is currently unavailable. Please try again later.',
      {exit: 1},
    )
  })

  test('requires slug argument', async () => {
    await expect(GetOpenApiCommand.run([])).rejects.toThrow(
      /Missing 1 required arg/i,
      // expect.objectContaining({
      //   message: expect.stringContaining('Missing required 1 arg'),
      // }),
    )
  })

  test('handles different slug formats', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/admin-api')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    await GetOpenApiCommand.run(['admin-api'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining(mockYamlSpec))
  })

  test('combines --web with slug in URL', async () => {
    await GetOpenApiCommand.run(['admin-api', '--web'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening https://www.sanity.io/docs/http-reference/admin-api'),
    )
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/admin-api')
  })
})
