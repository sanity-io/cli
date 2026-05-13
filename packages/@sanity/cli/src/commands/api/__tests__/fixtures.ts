/**
 * Shared test scaffolding for the `api` topic commands (`list`, `spec`,
 * `<endpoint>`). Every test in this topic mocks the same docs endpoints
 * (`/docs/api/openapi` + `/docs/api/openapi/<slug>?format=yaml`) and uses
 * the same nock-cleanup discipline; centralizing both keeps test files
 * focused on what they're actually asserting.
 */

// nock + vitest are devDeps; this fixtures module is test-only scaffolding.
// eslint-disable-next-line import-x/no-extraneous-dependencies
import nock, {cleanAll, pendingMocks} from 'nock'
// eslint-disable-next-line import-x/no-extraneous-dependencies
import {afterEach, expect, vi} from 'vitest'

const DOCS_HOST = 'https://www.sanity.io'
const INDEX_PATH = '/docs/api/openapi'

interface MockSpec {
  slug: string
  yaml: string

  /** Falls back to `slug` when omitted. */
  title?: string
}

/**
 * Mock the OpenAPI index plus one YAML body per spec. Mirrors what every
 * `api/*` command does at startup: fetch the index, then fetch each spec
 * body. Tests that need a different host (e.g. base-URL override) or a
 * non-200 response should set up nock directly.
 */
export function mockIndexAndSpecs(specs: MockSpec[]): void {
  nock(DOCS_HOST)
    .get(INDEX_PATH)
    .reply(200, {
      specs: specs.map((s) => ({
        description: '',
        slug: s.slug,
        title: s.title ?? s.slug,
      })),
    })
  for (const spec of specs) {
    nock(DOCS_HOST).get(`${INDEX_PATH}/${spec.slug}`).query({format: 'yaml'}).reply(200, spec.yaml)
  }
}

/**
 * Standard `afterEach` for every `api/*` test: reset vitest spies, drain
 * pending nock interceptors, and fail if any were left unconsumed
 * (catches missed-mock typos). Composes with additional `afterEach`
 * hooks the test file may register.
 */
export function setupApiTestCleanup(): void {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })
}

/**
 * Minimum-viable Jobs spec: one `GET /jobs/{jobId}` with a required path
 * parameter and an optional query parameter. Big enough to exercise
 * capability classification, basic table rendering, and operation
 * resolution; small enough that tests don't bury their intent in YAML.
 */
export const JOBS_SPEC_YAML = `
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
        - in: query
          name: detail
          required: false
          schema:
            type: string
      responses:
        '200':
          description: ok
`

/**
 * Mutate spec exposing both a destructive POST (apply mutations) and a
 * DELETE (drop dataset) on `/data/mutate/{dataset}`. Useful for
 * filtering/capability-classification scenarios that need more than one
 * method on the same path.
 */
export const MUTATE_SPEC_YAML = `
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
  /data/mutate/{dataset}:
    post:
      summary: Apply mutations
      operationId: mutateDocuments
      parameters:
        - in: path
          name: dataset
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
    delete:
      summary: Drop the dataset
      operationId: dropDataset
      parameters:
        - in: path
          name: dataset
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
`
