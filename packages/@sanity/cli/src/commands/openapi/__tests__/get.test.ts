import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GetOpenApiCommand} from '../get.js'

const JOBS_YAML = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
paths: {}
`

const JOBS_JSON = JSON.stringify({info: {title: 'Jobs API'}, openapi: '3.1.1', paths: {}})

/**
 * `sanity openapi get` is deprecated but preserves the pre-deprecation
 * passthrough shape for the duration of the deprecation window. These
 * tests lock that contract: raw OpenAPI body (YAML by default, JSON
 * with `--format=json`) on stdout, deprecation warning on stderr.
 */
describe('#openapi:get (deprecated, back-compat passthrough)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('emits a deprecation warning on stderr', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_YAML)

    const {stderr} = await testCommand(GetOpenApiCommand, ['jobs'])
    expect(stderr).toContain('deprecated')
    expect(stderr).toContain('sanity api spec')
  })

  test('default fetches and prints raw YAML', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_YAML)

    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs'])
    expect(stdout).toContain('openapi: 3.1.1')
    expect(stdout).toContain('title: Jobs API')
    // YAML, not JSON
    expect(stdout.trim().startsWith('{')).toBe(false)
  })

  test('--format=json fetches and prints raw JSON (back-compat shape, not structured)', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'json'})
      .reply(200, JOBS_JSON)

    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs', '--format=json'])
    const parsed = JSON.parse(stdout)
    // Raw OpenAPI shape — top-level `openapi`, `info`, `paths`. NOT the
    // structured `{spec, operations, ...}` shape that `api spec` emits.
    expect(parsed).toHaveProperty('openapi', '3.1.1')
    expect(parsed).toHaveProperty('info.title', 'Jobs API')
    expect(parsed).not.toHaveProperty('operations')
  })

  test('--web opens browser without hitting the docs endpoint', async () => {
    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs', '--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/jobs')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/jobs')
  })

  test('errors cleanly on 404', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi/nope').query({format: 'yaml'}).reply(404)

    const {error} = await testCommand(GetOpenApiCommand, ['nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('not found')
  })

  test('errors cleanly when the docs service is unreachable', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .replyWithError('Network error')

    const {error} = await testCommand(GetOpenApiCommand, ['jobs'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI service is currently unavailable')
  })
})
