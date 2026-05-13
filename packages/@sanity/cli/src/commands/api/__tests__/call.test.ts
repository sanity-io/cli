import {getCliToken, SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ApiCallCommand} from '../index.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getCliToken: vi.fn()}
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {...actual, confirm: vi.fn()}
})

const JOBS_YAML = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /jobs/{jobId}:
    get:
      summary: Job status
      operationId: jobStatus
      parameters:
        - in: path
          name: jobId
          required: true
          schema: {type: string}
      responses:
        '200':
          description: ok
  /jobs/{jobId}/listen:
    get:
      summary: Listen for job updates
      operationId: jobListen
      parameters:
        - in: path
          name: jobId
          required: true
          schema: {type: string}
      responses:
        '200':
          content:
            text/event-stream:
              schema: {type: string}
`

const QUERY_YAML = `
openapi: 3.1.1
info:
  title: Query API
  version: 'v2024-01-01'
servers:
  - url: 'https://{projectId}.api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
      projectId:
        default: 'your-project-id'
paths:
  /data/query/{dataset}:
    get:
      operationId: queryDataset
      parameters:
        - in: path
          name: dataset
          required: true
          schema: {type: string}
        - in: query
          name: query
          required: true
          schema: {type: string}
      responses:
        '200':
          description: ok
`

const POST_YAML = `
openapi: 3.1.1
info:
  title: Mutate API
  version: 'v2024-01-01'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
paths:
  /mutate/{dataset}:
    post:
      summary: Apply mutations
      operationId: mutate
      parameters:
        - in: path
          name: dataset
          required: true
          schema: {type: string}
      requestBody:
        required: true
        content:
          application/json:
            schema: {type: object}
      responses:
        '200':
          description: ok
`

const PROJECTS_YAML = `
openapi: 3.1.1
info:
  title: Projects API
  version: 'v2024-01-01'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
paths:
  /projects/{projectId}:
    delete:
      operationId: deleteProject
      parameters:
        - in: path
          name: projectId
          required: true
          schema: {type: string}
      responses:
        '204':
          description: ok
`

function mockIndexAndSpecs(specs: Array<{slug: string; yaml: string}>) {
  nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {
      specs: specs.map((s) => ({description: '', revision: '', slug: s.slug, title: s.slug})),
    })
  for (const spec of specs) {
    nock('https://www.sanity.io')
      .get(`/docs/api/openapi/${spec.slug}`)
      .query({format: 'yaml'})
      .reply(200, spec.yaml)
  }
}

describe('#api:call', () => {
  afterEach(() => {
    // `mockReset` drops queued `mockResolvedValueOnce` values that
    // weren't consumed (e.g. tests that error before the token is
    // resolved). Without this, leftover values leak into later tests.
    vi.mocked(getCliToken).mockReset()
    vi.mocked(confirm).mockReset()
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('GET returns pretty-printed JSON by default', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(200, {id: 'abc123', state: 'completed'}, {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {stdout} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123'])
    expect(stdout).toContain('"id": "abc123"')
    expect(stdout).toContain('"state": "completed"')
  })

  test('--json passes the raw response body through unchanged', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    const raw = '{"id":"abc","state":"completed"}'
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(200, raw, {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {stdout} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '--json'])
    expect(stdout.trim()).toBe(raw)
  })

  test('--project fills :projectId in the host', async () => {
    mockIndexAndSpecs([{slug: 'query', yaml: QUERY_YAML}])
    nock('https://xyz789.api.sanity.io')
      .get('/v2024-01-01/data/query/production')
      .query({query: '*[0]', tag: 'sanity.cli.api'})
      .reply(200, {result: []}, {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, [
      'v2024-01-01/data/query/production',
      '--project=xyz789',
      '-q',
      'query=*[0]',
    ])
  })

  test('--token overrides the stored token in Authorization header', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io', {reqheaders: {authorization: 'Bearer flag-token'}})
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('stored-token')
    await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '--token=flag-token'])
  })

  test('-q repeated key sends ?k=a&k=b (server array semantics)', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query(
        (q) =>
          q.foo === 'a' || (Array.isArray(q.foo) && q.foo.includes('a') && q.foo.includes('b')),
      )
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '-q', 'foo=a', '-q', 'foo=b'])
  })

  test('-q value overrides an inline value for the same key', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query({foo: 'flag', tag: 'sanity.cli.api'})
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123?foo=inline', '-q', 'foo=flag'])
  })

  test('errors before sending when an unfilled :placeholder remains', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    // No outbound mock — the request shouldn't fire.

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/:jobId'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unfilled path placeholder(s): :jobId')
  })

  test('errors before sending when a required query param is missing', async () => {
    mockIndexAndSpecs([{slug: 'query', yaml: QUERY_YAML}])
    // No outbound mock — the request shouldn't fire.

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      'v2024-01-01/data/query/production',
      '--project=xyz789',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required query parameter(s): query')
  })

  test.each(['list', 'spec'])(
    'subcommand name "%s" passed as endpoint errors cleanly (routing safety)',
    async (subcommand) => {
      // oclif routes `sanity api list` → ApiListCommand and `sanity api spec`
      // → ApiSpecCommand. This test is a guardrail: if the routing ever
      // regressed and a subcommand name slipped through to ApiCallCommand,
      // the command must reject it cleanly rather than try to fetch
      // `/list` or `/spec` as an HTTP endpoint.
      mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

      vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
      const {error} = await testCommand(ApiCallCommand, [subcommand])
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('No operation matches path')
    },
  )

  test('errors when the endpoint does not match any operation', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v9999-99-99/something/made/up'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No operation matches path')
  })

  test('accepts {name} placeholder syntax interchangeably with :name', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    // {jobId} normalizes to :jobId; the user has substituted it with abc123.
    await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123'])
  })

  test('errors with method-not-allowed when method is not declared on path', async () => {
    // JOBS_YAML only declares GET on /jobs/{jobId}. Resolving with
    // `-X POST` should surface the method-not-allowed error from
    // `resolveEndpoint`, not the body-not-yet-supported preflight gate
    // (that gate only fires once a POST operation actually matches).
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '-X', 'POST'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message.toLowerCase()).toMatch(/method post not allowed|method not allowed/)
  })

  test('POST with no body flags surfaces a "needs a body" hint pointing at -f/-F/--input', async () => {
    // Real POST operation, no -f/-F/--input — the body-construction
    // module flags the missing body upfront so the user gets a clear
    // hint rather than a server-side 4xx.
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      'v2024-01-01/mutate/production',
      '-X',
      'POST',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('POST needs a request body')
    expect(error?.message).toMatch(/-f.*-F.*--input/)
  })

  test('-f builds a JSON body and sends application/json', async () => {
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])
    nock('https://api.sanity.io', {reqheaders: {'content-type': 'application/json'}})
      .post('/v2024-01-01/mutate/production', {mutations: [{create: {_type: 'doc'}}]})
      .query({tag: 'sanity.cli.api'})
      .reply(200, '{"transactionId":"abc"}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {stdout} = await testCommand(ApiCallCommand, [
      '-X',
      'POST',
      'v2024-01-01/mutate/production',
      '-f',
      'mutations=[{"create":{"_type":"doc"}}]',
    ])
    expect(stdout).toContain('"transactionId": "abc"')
  })

  test('-f with dotted keys nests the JSON object', async () => {
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])
    nock('https://api.sanity.io')
      .post('/v2024-01-01/mutate/production', {profile: {age: 42, name: 'Bob'}})
      .query({tag: 'sanity.cli.api'})
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, [
      '-X',
      'POST',
      'v2024-01-01/mutate/production',
      '-f',
      'profile.name=Bob',
      '-f',
      'profile.age=42',
    ])
  })

  test('GET refuses body flags (HTTP semantics)', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '-f', 'foo=bar'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('GET requests cannot carry a body')
  })

  test('-f and --input are mutually exclusive', async () => {
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      '-X',
      'POST',
      'v2024-01-01/mutate/production',
      '-f',
      'foo=bar',
      '--input',
      '/tmp/whatever',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('mutually exclusive')
  })

  test('-H overrides the default Authorization header', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    // The default would be `Bearer user-token`; the user's -H wins.
    nock('https://api.sanity.io', {reqheaders: {authorization: 'Basic Zm9vOmJhcg=='}})
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(200, '{}', {'content-type': 'application/json'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, [
      'v2021-06-07/jobs/abc123',
      '-H',
      'Authorization: Basic Zm9vOmJhcg==',
    ])
  })

  test('--dry-run prints the request and skips the network call', async () => {
    // No outbound nock — proves the request never goes out.
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token-secret')
    const {stdout} = await testCommand(ApiCallCommand, [
      '-X',
      'POST',
      'v2024-01-01/mutate/production',
      '-f',
      'mutations=[]',
      '--dry-run',
    ])
    expect(stdout).toContain('POST https://api.sanity.io/v2024-01-01/mutate/production')
    expect(stdout).toContain('content-type: application/json')
    expect(stdout).toContain('"mutations":[]')
  })

  test('--dry-run masks the bearer token in the printed Authorization header', async () => {
    // Avoid leaking secrets via screenshot / paste. The masked form
    // is just enough to identify the token without making it readable.
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('sk-abcdefghijklmnop')
    const {stdout} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '--dry-run'])
    expect(stdout).toContain('GET ')
    expect(stdout).toMatch(/authorization: Bearer sk-a…mnop/)
    expect(stdout).not.toContain('sk-abcdefghijklmnop')
  })

  test('--dry-run on a destructive op never prompts', async () => {
    // The destructive guard is part of the send path; dry-run sits
    // before it so the user can preview a DELETE without confirming.
    mockIndexAndSpecs([{slug: 'projects', yaml: PROJECTS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {stdout} = await testCommand(ApiCallCommand, [
      '-X',
      'DELETE',
      'v2024-01-01/projects/abc123',
      '--dry-run',
    ])
    expect(stdout).toContain('DELETE')
    expect(confirm).not.toHaveBeenCalled()
  })

  test('--stream pipes the response body chunk-by-chunk to stdout', async () => {
    // Build a multi-chunk SSE-like response. nock supports streamed
    // replies via a function — the body is delivered as written.
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    const sseBody = 'data: chunk1\n\ndata: chunk2\n\n'
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123/listen')
      .query({tag: 'sanity.cli.api'})
      .reply(200, sseBody, {'content-type': 'text/event-stream'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {stdout} = await testCommand(ApiCallCommand, [
      'v2021-06-07/jobs/abc123/listen',
      '--stream',
    ])
    expect(stdout).toContain('data: chunk1')
    expect(stdout).toContain('data: chunk2')
  })

  test('--stream exits non-zero on a 4xx', async () => {
    // Stream still emits the body so the user sees the error payload,
    // but the exit code stays non-zero so wrapping scripts notice.
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123/listen')
      .query({tag: 'sanity.cli.api'})
      .reply(404, 'not found', {'content-type': 'text/plain'})

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error, stdout} = await testCommand(ApiCallCommand, [
      'v2021-06-07/jobs/abc123/listen',
      '--stream',
    ])
    expect(stdout).toContain('not found')
    expect(error).toBeInstanceOf(Error)
  })

  test('-H without `:` errors before sending', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      'v2021-06-07/jobs/abc123',
      '-H',
      'malformed',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('"Name: Value" form')
  })

  test('refuses DELETE in unattended mode without --yes', async () => {
    mockIndexAndSpecs([{slug: 'projects', yaml: PROJECTS_YAML}])
    // Force unattended. `isUnattended` is `protected` on SanityCommand;
    // the cast through `unknown` is the simplest path to vi.spyOn.
    const isUnattended = vi.spyOn(
      SanityCommand.prototype as unknown as {isUnattended: () => boolean},
      'isUnattended',
    )
    isUnattended.mockReturnValue(true)

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      '-X',
      'DELETE',
      'v2024-01-01/projects/abc123',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Refusing to execute a destructive operation')
    expect(error?.message).toContain('--yes')

    isUnattended.mockRestore()
  })

  test('rejects -q values that are missing `=`', async () => {
    // No index/outbound mocks: validation runs before the index fetch,
    // so getting past validation would surface as an unrelated nock
    // pending-mock failure.
    const {error} = await testCommand(ApiCallCommand, [
      'v2021-06-07/jobs/abc123',
      '-q',
      'malformed',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('key=value form')
    expect(error?.message).toContain('"malformed"')
  })

  test('aborted destructive prompt exits non-zero', async () => {
    // Force interactive (not unattended), then decline the prompt. A
    // user-declined destructive op should exit non-zero so wrapping
    // scripts don't treat it as a successful no-op.
    mockIndexAndSpecs([{slug: 'projects', yaml: PROJECTS_YAML}])
    const isUnattended = vi.spyOn(
      SanityCommand.prototype as unknown as {isUnattended: () => boolean},
      'isUnattended',
    )
    isUnattended.mockReturnValue(false)
    vi.mocked(confirm).mockResolvedValueOnce(false)

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      '-X',
      'DELETE',
      'v2024-01-01/projects/abc123',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Aborted')

    isUnattended.mockRestore()
  })

  test('destructive prompt strips the telemetry tag from the URL', async () => {
    // The `?tag=sanity.cli.api` parameter is CLI implementation noise.
    // It must not appear in the confirmation message — the user shouldn't
    // have to mentally subtract it when deciding whether to proceed.
    mockIndexAndSpecs([{slug: 'projects', yaml: PROJECTS_YAML}])
    const isUnattended = vi.spyOn(
      SanityCommand.prototype as unknown as {isUnattended: () => boolean},
      'isUnattended',
    )
    isUnattended.mockReturnValue(false)
    vi.mocked(confirm).mockResolvedValueOnce(false)

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, ['-X', 'DELETE', 'v2024-01-01/projects/abc123'])

    expect(confirm).toHaveBeenCalledOnce()
    const message = vi.mocked(confirm).mock.calls[0]?.[0]?.message ?? ''
    expect(message).not.toContain('tag=sanity.cli.api')
    expect(message).toContain('/v2024-01-01/projects/abc123')

    isUnattended.mockRestore()
  })

  test('surfaces a friendly error when the docs index is unreachable', async () => {
    // Every `sanity api <endpoint>` call depends on the operations
    // index. If the docs service is down we want a clean, single-line
    // error — not a raw fetch trace.
    nock('https://www.sanity.io').get('/docs/api/openapi').replyWithError('Network error')

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI service is currently unavailable')
  })

  test('DELETE with --yes proceeds without prompting', async () => {
    mockIndexAndSpecs([{slug: 'projects', yaml: PROJECTS_YAML}])
    nock('https://api.sanity.io')
      .delete('/v2024-01-01/projects/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(204)

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    await testCommand(ApiCallCommand, ['-X', 'DELETE', 'v2024-01-01/projects/abc123', '--yes'])
    expect(confirm).not.toHaveBeenCalled()
  })

  test('401 from server surfaces a `sanity login` / --token hint', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])
    nock('https://api.sanity.io')
      .get('/v2021-06-07/jobs/abc123')
      .query({tag: 'sanity.cli.api'})
      .reply(401, 'Unauthorized')

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('401')
    expect(error?.message).toContain('sanity login')
    expect(error?.message).toContain('--token')
  })
})
