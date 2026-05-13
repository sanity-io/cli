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
      expect(error?.message).toContain('No spec found owning path')
    },
  )

  test('errors when the endpoint does not match any operation', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v9999-99-99/something/made/up'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No spec found owning path')
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

  test('POST that resolves to a body op errors at the Phase-4 gate', async () => {
    // Real POST operation: the resolver succeeds, then preflight's
    // body-not-yet-supported gate fires with the Phase-4 hint. Locks
    // down the user-facing copy that points at the upcoming feature.
    mockIndexAndSpecs([{slug: 'mutate', yaml: POST_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, [
      'v2024-01-01/mutate/production',
      '-X',
      'POST',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('POST needs a request body')
    expect(error?.message).toContain('Phase 4')
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
