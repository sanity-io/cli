import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ApiSpecCommand} from '../spec.js'

const JOBS_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
  description: Monitor and manage jobs
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /jobs/{jobId}:
    get:
      summary: Get the status of a job
      operationId: jobStatus
      parameters:
        - in: path
          name: jobId
          required: true
          schema:
            type: string
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
          schema:
            type: string
      responses:
        '200':
          content:
            text/event-stream:
              schema:
                type: string
`

async function seedCache(cacheRoot: string, slug: string, revision: string, yaml: string) {
  const apiDir = path.join(cacheRoot, 'api')
  await fs.mkdir(path.join(apiDir, 'specs'), {recursive: true})
  await fs.writeFile(path.join(apiDir, 'specs', `${slug}.yaml`), yaml, 'utf8')
  await fs.writeFile(
    path.join(apiDir, 'revisions.json'),
    JSON.stringify({[slug]: revision}),
    'utf8',
  )
}

function mockIndex(spec: {description?: string; revision: string; slug: string; title?: string}) {
  return nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {
      specs: [
        {
          description: spec.description ?? '',
          revision: spec.revision,
          slug: spec.slug,
          title: spec.title ?? spec.slug,
        },
      ],
    })
}

describe('#api:spec', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-cli-api-spec-test-'))
    process.env.SANITY_CLI_CACHE_PATH = tmpDir
  })

  afterEach(async () => {
    delete process.env.SANITY_CLI_CACHE_PATH
    await fs.rm(tmpDir, {force: true, recursive: true})
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('default mode renders human-readable structured view', async () => {
    await seedCache(tmpDir, 'jobs', 'rev1', JOBS_SPEC_YAML)
    mockIndex({description: 'Jobs', revision: 'rev1', slug: 'jobs', title: 'Jobs API'})

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs'])

    expect(stdout).toContain('Jobs API — v2021-06-07')
    expect(stdout).toContain('Docs: https://www.sanity.io/docs/http-reference/jobs')
    expect(stdout).toContain('GET  v2021-06-07/jobs/:jobId')
    expect(stdout).toContain('jobStatus')
    expect(stdout).toContain('Path params:')
    expect(stdout).toContain('jobId')
    // Streaming op gets the stream tag
    expect(stdout).toContain('stream')
  })

  test('--format=json emits structured per-operation JSON', async () => {
    await seedCache(tmpDir, 'jobs', 'rev1', JOBS_SPEC_YAML)
    mockIndex({description: 'Jobs', revision: 'rev1', slug: 'jobs', title: 'Jobs API'})

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--format=json'])

    const parsed = JSON.parse(stdout)
    expect(parsed).toMatchObject({
      description: 'Jobs',
      docsUrl: 'https://www.sanity.io/docs/http-reference/jobs',
      spec: 'jobs',
      title: 'Jobs API',
      version: 'v2021-06-07',
    })
    expect(parsed.operations).toHaveLength(2)
    expect(
      parsed.operations.find((op: {operationId: string}) => op.operationId === 'jobStatus'),
    ).toMatchObject({
      capability: 'read',
      endpoint: 'v2021-06-07/jobs/:jobId',
      isStreaming: false,
      method: 'GET',
      pathParams: ['jobId'],
    })
  })

  test('--format=openapi passes through the raw YAML', async () => {
    await seedCache(tmpDir, 'jobs', 'rev1', JOBS_SPEC_YAML)
    mockIndex({revision: 'rev1', slug: 'jobs'})

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--format=openapi'])
    expect(stdout).toContain('openapi: 3.1.1')
    expect(stdout).toContain('operationId: jobStatus')
    // YAML-shaped, not JSON: shouldn't begin with `{` or have JSON pretty-print indentation.
    expect(stdout.trim().startsWith('{')).toBe(false)
  })

  test('--operation narrows JSON output', async () => {
    await seedCache(tmpDir, 'jobs', 'rev1', JOBS_SPEC_YAML)
    mockIndex({revision: 'rev1', slug: 'jobs'})

    const {stdout} = await testCommand(ApiSpecCommand, [
      'jobs',
      '--format=json',
      '--operation=jobStatus',
    ])

    const parsed = JSON.parse(stdout)
    expect(parsed.operations).toHaveLength(1)
    expect(parsed.operations[0].operationId).toBe('jobStatus')
  })

  test('unknown --operation errors with the known ids', async () => {
    await seedCache(tmpDir, 'jobs', 'rev1', JOBS_SPEC_YAML)
    mockIndex({revision: 'rev1', slug: 'jobs'})

    const {error} = await testCommand(ApiSpecCommand, ['jobs', '--operation=nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Operation "nope" not found')
    expect(error?.message).toContain('jobStatus')
    expect(error?.message).toContain('jobListen')
  })

  test('--web opens the docs page (open is globally mocked)', async () => {
    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/jobs')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/jobs')
  })

  test('unknown slug errors before sending', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: [{description: '', revision: 'r', slug: 'other', title: 'Other'}]})

    const {error} = await testCommand(ApiSpecCommand, ['jobs'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Spec "jobs" not found')
  })
})
