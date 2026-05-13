import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ListOpenApiCommand} from '../list.js'

const JOBS_SPEC_YAML = `
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
`

function mockIndexAndJobs() {
  nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {specs: [{description: '', revision: '', slug: 'jobs', title: 'Jobs API'}]})
  nock('https://www.sanity.io')
    .get('/docs/api/openapi/jobs')
    .query({format: 'yaml'})
    .reply(200, JOBS_SPEC_YAML)
}

/**
 * `sanity openapi list` is a deprecation forwarder for `sanity api list`.
 * These tests assert the forwarder semantics: stderr warning + delegation
 * to the canonical command.
 */
describe('#openapi:list (deprecation forwarder)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('emits a deprecation warning and delegates to api list', async () => {
    mockIndexAndJobs()

    const {stderr, stdout} = await testCommand(ListOpenApiCommand)

    // Warning on stderr, naming the canonical command.
    expect(stderr).toContain('deprecated')
    expect(stderr).toContain('sanity api list')

    // Stdout is the canonical `api list` output — operation row table.
    expect(stdout).toContain('METHOD')
    expect(stdout).toContain('v2021-06-07/jobs/:jobId')
  })

  test('forwards --json flag through', async () => {
    mockIndexAndJobs()

    const {stderr, stdout} = await testCommand(ListOpenApiCommand, ['--json'])
    expect(stderr).toContain('deprecated')

    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toMatchObject({operationId: 'jobStatus', spec: 'jobs'})
  })

  test('forwards --web flag', async () => {
    const {stdout} = await testCommand(ListOpenApiCommand, ['--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference')
  })
})
