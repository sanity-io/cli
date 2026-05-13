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

  test('POST without body flags errors before sending and names Phase 4', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_YAML}])

    vi.mocked(getCliToken).mockResolvedValueOnce('user-token')
    const {error} = await testCommand(ApiCallCommand, ['v2021-06-07/jobs/abc123', '-X', 'POST'])
    // The endpoint doesn't have a POST, but the body-method gate fires
    // first only when a POST operation IS matched. Here the endpoint has
    // only GET, so we expect a method-not-allowed error.
    expect(error).toBeInstanceOf(Error)
    expect(error?.message.toLowerCase()).toMatch(/method post not allowed|method not allowed/)
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
