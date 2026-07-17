import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ApiCommand} from '../api.js'

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const GLOBAL_HOST = 'https://api.sanity.io'
const PROJECT_HOST = `https://${testProjectId}.api.sanity.io`
const TAG = 'sanity.cli.api'

class StdinApiCommand extends ApiCommand {
  protected override readStdin(): Promise<string> {
    return Promise.resolve('{"from": "stdin"}')
  }
}

describe('#api', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('makes an authenticated GET request to the global host by default', async () => {
    nock(GLOBAL_HOST, {reqheaders: {authorization: 'Bearer test-token'}})
      .get('/v2025-02-19/users/me')
      .query({tag: TAG})
      .reply(200, {id: 'u1'}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ApiCommand, ['users/me'], {mocks: defaultMocks})

    expect(JSON.parse(stdout)).toEqual({id: 'u1'})
  })

  test('uses the API version from the matching OpenAPI spec', async () => {
    nock(GLOBAL_HOST)
      .get('/v2021-06-07/projects')
      .query({tag: TAG})
      .reply(200, [], {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ApiCommand, ['projects'], {mocks: defaultMocks})

    expect(stdout.trim()).toBe('[]')
  })

  test('routes spec-matched paths to the project host and fills {dataset}', async () => {
    nock(PROJECT_HOST)
      .get('/v2025-02-19/data/query/production')
      .query({query: '*', tag: TAG})
      .reply(200, {result: []}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(ApiCommand, ['data/query/{dataset}?query=*'], {
      mocks: defaultMocks,
    })

    expect(JSON.parse(stdout)).toEqual({result: []})
  })

  test('fills {projectId} placeholders from CLI config', async () => {
    nock(GLOBAL_HOST)
      .get(`/v2021-06-07/projects/${testProjectId}/datasets`)
      .query({tag: TAG})
      .reply(200, [], {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['projects/{projectId}/datasets'], {mocks: defaultMocks})
  })

  test('honors an embedded API version and explicit --api-version', async () => {
    nock(GLOBAL_HOST)
      .get('/v2023-01-01/projects')
      .query({tag: TAG})
      .times(2)
      .reply(200, [], {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['v2023-01-01/projects'], {mocks: defaultMocks})
    await testCommand(ApiCommand, ['projects', '--api-version', 'v2023-01-01'], {
      mocks: defaultMocks,
    })
  })

  test('sends fields as a JSON body and defaults to POST', async () => {
    nock(PROJECT_HOST)
      .post('/v2025-02-19/data/mutate/production', {
        mutations: [{create: {_type: 'movie'}}, {patch: {id: 'movie-1'}}],
        returnIds: true,
      })
      .query({tag: TAG})
      .reply(200, {transactionId: 't1'}, {'Content-Type': 'application/json'})

    const {stdout} = await testCommand(
      ApiCommand,
      [
        'data/mutate/{dataset}',
        '-F',
        'mutations[][create][_type]=movie',
        '-F',
        'mutations[][patch][id]=movie-1',
        '-F',
        'returnIds=true',
      ],
      {mocks: defaultMocks},
    )

    expect(JSON.parse(stdout)).toEqual({transactionId: 't1'})
  })

  test('sends fields as query parameters for explicit GET requests', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/some/endpoint')
      .query({limit: '10', tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['some/endpoint', '-X', 'GET', '-F', 'limit=10'], {
      mocks: defaultMocks,
    })
  })

  test('sends a raw body from stdin with --input -', async () => {
    nock(PROJECT_HOST)
      .post('/v2025-02-19/data/mutate/production', '{"from": "stdin"}')
      .query({tag: TAG})
      .reply(200, {ok: true}, {'Content-Type': 'application/json'})

    await testCommand(StdinApiCommand, ['data/mutate/{dataset}', '--input', '-'], {
      mocks: defaultMocks,
    })
  })

  test('sends custom headers', async () => {
    nock(GLOBAL_HOST, {reqheaders: {'x-custom': 'yes'}})
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['some/endpoint', '-H', 'X-Custom: yes'], {mocks: defaultMocks})
  })

  test('omits the authorization header with --anonymous', async () => {
    nock(GLOBAL_HOST, {badheaders: ['authorization']})
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['some/endpoint', '--anonymous'], {mocks: defaultMocks})
  })

  test('forces the project host with --project-hosted', async () => {
    nock(PROJECT_HOST)
      .get('/v2025-02-19/users/me')
      .query({tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['users/me', '--project-hosted'], {mocks: defaultMocks})
  })

  test('forces the global host with --global', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/data/query/production')
      .query({tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, ['data/query/production', '--global'], {mocks: defaultMocks})
  })

  test('requests full URLs on Sanity API hosts verbatim', async () => {
    nock(GLOBAL_HOST)
      .get('/v1/users/me')
      .query({tag: TAG})
      .reply(200, {}, {'Content-Type': 'application/json'})

    await testCommand(ApiCommand, [`${GLOBAL_HOST}/v1/users/me`], {mocks: defaultMocks})
  })

  test('prints non-JSON responses verbatim', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(200, 'plain text response', {'Content-Type': 'text/plain'})

    const {stdout} = await testCommand(ApiCommand, ['some/endpoint'], {mocks: defaultMocks})

    expect(stdout.trim()).toBe('plain text response')
  })

  test('prints the status line and headers with --include', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(200, {ok: true}, {'Content-Type': 'application/json', 'X-Served-By': 'test'})

    const {stdout} = await testCommand(ApiCommand, ['some/endpoint', '--include'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('HTTP 200')
    expect(stdout).toContain('x-served-by: test')
    expect(stdout).toContain('"ok": true')
  })

  test('prints error response bodies and exits with code 1', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(404, {error: 'not found'}, {'Content-Type': 'application/json'})

    const {error, stdout} = await testCommand(ApiCommand, ['some/endpoint'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('"error": "not found"')
    expect(error?.message).toContain('HTTP 404')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('suggests logging in again on 401 responses', async () => {
    nock(GLOBAL_HOST)
      .get('/v2025-02-19/some/endpoint')
      .query({tag: TAG})
      .reply(401, {error: 'unauthorized'}, {'Content-Type': 'application/json'})

    const {error} = await testCommand(ApiCommand, ['some/endpoint'], {mocks: defaultMocks})

    expect(error?.message).toContain('sanity login')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits with code 2 on invalid fields', async () => {
    const {error} = await testCommand(ApiCommand, ['some/endpoint', '-f', 'missing-separator'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('expected key=value')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('exits with code 2 on unresolved placeholders', async () => {
    const {error} = await testCommand(ApiCommand, ['jobs/{jobId}'], {mocks: defaultMocks})

    expect(error?.message).toContain('{jobId}')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('exits with code 2 on full URLs outside Sanity API hosts', async () => {
    const {error} = await testCommand(ApiCommand, ['https://evil.example.com/steal'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Refusing to send')
    expect(error?.oclif?.exit).toBe(2)
  })
})
