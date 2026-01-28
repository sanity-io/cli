import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GetOpenApiCommand} from '../get.js'

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
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('gets YAML spec by default', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    const {stdout} = await testCommand(GetOpenApiCommand, ['query'])

    expect(stdout).toContain(mockYamlSpec)
  })

  test('gets JSON spec with --format=json', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'json'})
      .reply(200, mockJsonSpec, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(GetOpenApiCommand, ['query', '--format=json'])

    expect(stdout).toContain(mockJsonSpec)
  })

  test('gets YAML spec with explicit --format=yaml', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    const {stdout} = await testCommand(GetOpenApiCommand, ['query', '--format=yaml'])

    expect(stdout).toContain(mockYamlSpec)
  })

  test('opens web browser with --web flag', async () => {
    const {stdout} = await testCommand(GetOpenApiCommand, ['query', '--web'])

    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/query')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/query')
  })

  test('handles 404 not found', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/nonexistent')
      .query({format: 'yaml'})
      .reply(404, 'Not Found')

    const {error} = await testCommand(GetOpenApiCommand, ['nonexistent'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI specification not found. nonexistent')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles server error', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .reply(500, 'Server Error')

    const {error} = await testCommand(GetOpenApiCommand, ['query'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'The OpenAPI service is currently unavailable. Please try again later.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network error', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/query')
      .query({format: 'yaml'})
      .replyWithError('Network error')

    const {error} = await testCommand(GetOpenApiCommand, ['query'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'The OpenAPI service is currently unavailable. Please try again later.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires slug argument', async () => {
    const {error} = await testCommand(GetOpenApiCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.message).toContain('slug')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('handles different slug formats', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/admin-api')
      .query({format: 'yaml'})
      .reply(200, mockYamlSpec, {'Content-Type': 'text/yaml'})

    const {stdout} = await testCommand(GetOpenApiCommand, ['admin-api'])

    expect(stdout).toContain(mockYamlSpec)
  })

  test('combines --web with slug in URL', async () => {
    const {stdout} = await testCommand(GetOpenApiCommand, ['admin-api', '--web'])

    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/admin-api')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/admin-api')
  })
})
