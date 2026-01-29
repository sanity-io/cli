import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ListOpenApiCommand} from '../list.js'

const mockSpecs = [
  {
    description: 'Query documents and other content',
    slug: 'query',
    title: 'Query API',
  },
  {
    description: 'Create, update and delete documents',
    slug: 'mutate',
    title: 'Mutate API',
  },
]

describe('#openapi:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays OpenAPI specs correctly', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: mockSpecs}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ListOpenApiCommand)

    expect(stdout).toContain('Title: Query API')
    expect(stdout).toContain('Description: Query documents and other content')
    expect(stdout).toContain('Slug: query')
    expect(stdout).toContain('Title: Mutate API')
    expect(stdout).toContain('Description: Create, update and delete documents')
    expect(stdout).toContain('Slug: mutate')
  })

  test('displays specs in JSON format with --json flag', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: mockSpecs}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ListOpenApiCommand, ['--json'])

    expect(stdout).toContain(JSON.stringify(mockSpecs, null, 2))
  })

  test('opens web browser with --web flag', async () => {
    const {stdout} = await testCommand(ListOpenApiCommand, ['--web'])

    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference')
  })

  test('handles empty specs list', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: []}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ListOpenApiCommand)

    expect(stdout).toContain('No OpenAPI specifications available.')
  })

  test('handles missing specs property', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ListOpenApiCommand)

    expect(stdout).toContain('No OpenAPI specifications available.')
  })

  test('handles specs without description', async () => {
    const specsWithoutDesc = [{slug: 'test', title: 'Test API'}]
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: specsWithoutDesc}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ListOpenApiCommand)

    expect(stdout).toContain('Title: Test API')
    expect(stdout).not.toContain('  ')
  })

  test('handles API server error', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(500, 'Server Error')

    const {error} = await testCommand(ListOpenApiCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'The OpenAPI service is currently unavailable. Please try again later.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network error', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').replyWithError('Network error')

    const {error} = await testCommand(ListOpenApiCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'The OpenAPI service is currently unavailable. Please try again later.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })
})
