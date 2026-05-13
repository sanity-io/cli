import {describe, expect, test} from 'vitest'

import {type ParsedParam} from '../parser.js'
import {type PreflightInputs, runPreflight} from '../preflight.js'

function buildOp(
  overrides: {
    endpoint?: string
    method?: string
    queryParams?: ParsedParam[]
    serverTemplate?: string
  } = {},
) {
  return {
    capability: 'read' as const,
    description: '',
    endpoint: overrides.endpoint ?? 'v1/things/:id',
    headerParams: [],
    isStreaming: false,
    method: overrides.method ?? 'GET',
    openApiPath: '/things/{id}',
    operationId: 'op',
    pathParams: [],
    queryParams: overrides.queryParams ?? [],
    requestBody: null,
    responses: [],
    security: [],
    serverTemplate: overrides.serverTemplate ?? 'https://api.sanity.io/v1',
    spec: 'spec',
    summary: '',
  }
}

function buildInputs(overrides: Partial<PreflightInputs> = {}): PreflightInputs {
  return {
    context: {},
    inlineQuery: '',
    queryFlags: [],
    resolved: {operation: overrides.resolved?.operation ?? buildOp(), path: 'v1/things/abc'},
    ...overrides,
  }
}

describe('runPreflight', () => {
  test('returns no issues when path + required query are satisfied', () => {
    const op = buildOp({
      queryParams: [{description: '', in: 'query', name: 'query', required: true, type: 'string'}],
    })
    const issues = runPreflight(
      buildInputs({
        queryFlags: ['query=*[0]'],
        resolved: {operation: op, path: 'v1/things/abc'},
      }),
    )
    expect(issues).toEqual([])
  })

  test('flags unfilled :placeholder in the path', () => {
    const issues = runPreflight(
      buildInputs({resolved: {operation: buildOp(), path: 'v1/things/:id'}}),
    )
    expect(issues).toEqual([{kind: 'unfilled-placeholder', names: ['id']}])
  })

  test('flags unfilled :projectId in the host template', () => {
    const op = buildOp({serverTemplate: 'https://:projectId.api.sanity.io/v1'})
    const issues = runPreflight(buildInputs({resolved: {operation: op, path: 'v1/things/abc'}}))
    expect(issues).toEqual([{kind: 'unfilled-placeholder', names: ['projectId']}])
  })

  test('fills :projectId from context, then flags only what is still missing', () => {
    const op = buildOp({serverTemplate: 'https://:projectId.api.sanity.io/v1'})
    const issues = runPreflight(
      buildInputs({
        context: {projectId: 'abc'},
        resolved: {operation: op, path: 'v1/data/:dataset'},
      }),
    )
    expect(issues).toEqual([{kind: 'unfilled-placeholder', names: ['dataset']}])
  })

  test('flags missing required query params, checking both inline and -q flag values', () => {
    const op = buildOp({
      queryParams: [
        {description: '', in: 'query', name: 'query', required: true, type: 'string'},
        {description: '', in: 'query', name: 'tag', required: false, type: 'string'},
      ],
    })
    const inline = runPreflight(
      buildInputs({inlineQuery: 'query=foo', resolved: {operation: op, path: 'v1/things/abc'}}),
    )
    expect(inline).toEqual([])

    const flag = runPreflight(
      buildInputs({queryFlags: ['query=foo'], resolved: {operation: op, path: 'v1/things/abc'}}),
    )
    expect(flag).toEqual([])

    const missing = runPreflight(buildInputs({resolved: {operation: op, path: 'v1/things/abc'}}))
    expect(missing).toEqual([{kind: 'missing-required-query', names: ['query']}])
  })

  test('accumulates multiple issues for callers that want to report them all', () => {
    const op = buildOp({
      method: 'PATCH',
      queryParams: [{description: '', in: 'query', name: 'query', required: true, type: 'string'}],
      serverTemplate: 'https://:projectId.api.sanity.io/v1',
    })
    const issues = runPreflight(buildInputs({resolved: {operation: op, path: 'v1/things/:id'}}))
    // Body construction lives in `body.ts` (Phase 4); preflight only
    // accumulates placeholder + query gaps now.
    expect(issues.map((i) => i.kind)).toEqual(['unfilled-placeholder', 'missing-required-query'])
  })
})
