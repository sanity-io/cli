import {describe, expect, test} from 'vitest'

import {
  buildOperationRequest,
  humanize,
  operationArgs,
  operationFlags,
  redactedFlags,
} from '../operationInput.js'
import {type ContextOperation} from '../operationTypes.js'

const createSource: ContextOperation = {
  body: 'required',
  description: 'Adds a source.',
  fields: [
    {in: 'body', name: 'type', options: ['web', 'files'], required: true, type: 'string'},
    {in: 'body', name: 'url', type: 'string', variants: ['web']},
    {in: 'body', name: 'includePaths', parent: 'crawlOptions', type: 'string[]', variants: ['web']},
    {in: 'body', name: 'maxDepth', parent: 'crawlOptions', type: 'integer', variants: ['web']},
    {in: 'body', name: 'title', type: 'string', variants: ['files']},
  ],
  noContent: false,
  paginated: false,
  pathParams: [{description: 'The knowledge base', name: 'knowledgeBaseId'}],
  route: 'POST /knowledge-bases/{knowledgeBaseId}/sources',
  startsJob: false,
  summary: 'Add a source',
}

const listKnowledgeBases: ContextOperation = {
  body: 'none',
  description: '',
  fields: [
    {in: 'query', name: 'cursor', type: 'string'},
    {in: 'query', name: 'limit', type: 'integer'},
    {in: 'query', name: 'organizationId', required: true, type: 'string'},
    {in: 'query', name: 'includeDrafts', type: 'boolean'},
  ],
  noContent: false,
  paginated: true,
  pathParams: [],
  route: 'GET /knowledge-bases',
  startsJob: false,
  summary: 'List knowledge bases',
}

const updateSource: ContextOperation = {
  body: 'required',
  description: '',
  fields: [
    {
      in: 'body',
      name: 'syncFrequency',
      nullable: true,
      options: ['weekly', 'monthly'],
      type: 'string',
    },
    {in: 'body', name: 'metadata', type: 'json'},
    {in: 'body', name: 'pageLimit', nullable: true, type: 'integer'},
  ],
  noContent: false,
  paginated: false,
  pathParams: [{name: 'knowledgeBaseId'}, {name: 'sourceId'}],
  route: 'PATCH /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
  startsJob: false,
  summary: 'Update a source',
}

const applyIssues: ContextOperation = {
  body: 'required',
  description: '',
  fields: [{in: 'body', name: 'issueIds', required: true, type: 'string[]'}],
  noContent: false,
  paginated: false,
  pathParams: [{name: 'knowledgeBaseId'}],
  route: 'POST /knowledge-bases/{knowledgeBaseId}/issues/apply',
  startsJob: true,
  summary: 'Accept and apply issues',
}

describe('operation flags and arguments', () => {
  test('path parameters become required arguments, fields become typed flags', () => {
    const args = operationArgs(createSource, {
      id: 'context sources create',
      operationId: 'createSource',
    })
    expect(Object.keys(args)).toEqual(['knowledgeBaseId'])
    expect(args.knowledgeBaseId).toMatchObject({description: 'The knowledge base', required: true})

    const flags = operationFlags(createSource, {
      id: 'context sources create',
      operationId: 'createSource',
    })
    expect(Object.keys(flags)).toEqual(['type', 'url', 'include-paths', 'max-depth', 'title'])
    expect(flags.type).toMatchObject({options: ['web', 'files'], type: 'option'})
    // The variant's own flags stand in for the discriminator
    expect(flags.type.required).toBeFalsy()
    expect(flags['include-paths']).toMatchObject({multiple: true, type: 'option'})
    expect(flags['max-depth'].description).toBe('Max depth. Only for type web.')
    expect(flags.title).not.toHaveProperty('required', true)
  })

  test('a paginated list drops the page flags, takes the organization as a flag, and query booleans as booleans', () => {
    const flags = operationFlags(listKnowledgeBases, {id: 'context list', operationId: 'x'})
    expect(Object.keys(flags).toSorted()).toEqual(['include-drafts', 'organization'])
    expect(flags['include-drafts']).toMatchObject({allowNo: true, type: 'boolean'})
  })

  test('nullable enums accept null, and watch, yes and variadic arguments come from the entry', () => {
    const update = operationFlags(updateSource, {id: 'context sources edit', operationId: 'x'})
    expect(update['sync-frequency']).toMatchObject({options: ['weekly', 'monthly', 'null']})

    const apply = {
      id: 'context issues apply',
      operationId: 'x',
      variadicArg: 'issueIds',
      watch: 'job',
    } as const
    expect(Object.keys(operationFlags(applyIssues, apply))).toEqual(['watch'])
    expect(operationArgs(applyIssues, apply).issueIds).toMatchObject({
      multiple: true,
      required: true,
    })

    const deletion = {
      ...updateSource,
      fields: [],
      route: 'DELETE /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
    } as const
    expect(operationFlags(deletion, {id: 'x', operationId: 'x'}).yes).toMatchObject({char: 'y'})
  })

  test('telemetry redacts free-text, list and JSON flags, not enums or booleans', () => {
    expect(redactedFlags(createSource, {id: 'x', operationId: 'x'})).toEqual([
      'url',
      'include-paths',
      'title',
    ])
    expect(redactedFlags(updateSource, {id: 'x', operationId: 'x'})).toEqual(['metadata'])
  })

  test('humanize turns field names into labels', () => {
    expect(humanize('openIssueCount')).toBe('Open issue count')
    expect(humanize('sourceId')).toBe('Source ID')
    expect(humanize('heading_offset')).toBe('Heading offset')
  })
})

describe('buildOperationRequest', () => {
  test('nests fields under their parent and infers the body variant from the fields given', () => {
    const request = buildOperationRequest(
      createSource,
      {id: 'x', operationId: 'x'},
      {
        args: {knowledgeBaseId: 'kb1'},
        flags: {'include-paths': ['^/docs/'], 'max-depth': 2, url: 'https://example.com'},
      },
    )
    expect(request).toEqual({
      body: {
        crawlOptions: {includePaths: ['^/docs/'], maxDepth: 2},
        type: 'web',
        url: 'https://example.com',
      },
      params: {knowledgeBaseId: 'kb1'},
      query: {},
    })
  })

  test('keeps an explicit type and leaves an ambiguous body for the API to judge', () => {
    const explicit = buildOperationRequest(
      createSource,
      {id: 'x', operationId: 'x'},
      {
        args: {knowledgeBaseId: 'kb1'},
        flags: {title: 'Notes', type: 'files'},
      },
    )
    expect(explicit.body).toEqual({title: 'Notes', type: 'files'})

    const ambiguous = buildOperationRequest(
      createSource,
      {id: 'x', operationId: 'x'},
      {
        args: {knowledgeBaseId: 'kb1'},
        flags: {},
      },
    )
    expect(ambiguous.body).toEqual({})
  })

  test('sends query booleans as strings and the resolved organization', () => {
    const request = buildOperationRequest(
      listKnowledgeBases,
      {id: 'x', operationId: 'x'},
      {
        args: {},
        flags: {'include-drafts': false},
        organizationId: 'org1',
      },
    )
    expect(request).toEqual({params: {}, query: {includeDrafts: 'false', organizationId: 'org1'}})
  })

  test('parses null, JSON and numbers, and refuses values the field cannot take', () => {
    const request = buildOperationRequest(
      updateSource,
      {id: 'x', operationId: 'x'},
      {
        args: {knowledgeBaseId: 'kb1', sourceId: 's1'},
        flags: {metadata: '{"team":"docs"}', 'page-limit': '20', 'sync-frequency': 'null'},
      },
    )
    expect(request.body).toEqual({metadata: {team: 'docs'}, pageLimit: 20, syncFrequency: null})
    expect(request.params).toEqual({knowledgeBaseId: 'kb1', sourceId: 's1'})

    expect(() =>
      buildOperationRequest(
        updateSource,
        {id: 'x', operationId: 'x'},
        {args: {}, flags: {metadata: '{'}},
      ),
    ).toThrow('`--metadata` must be JSON')
    expect(() =>
      buildOperationRequest(
        updateSource,
        {id: 'x', operationId: 'x'},
        {args: {}, flags: {'page-limit': 'ten'}},
      ),
    ).toThrow('`--page-limit` must be a number')
  })

  test('takes a variadic field from the arguments', () => {
    const request = buildOperationRequest(
      applyIssues,
      {id: 'x', operationId: 'x', variadicArg: 'issueIds'},
      {
        args: {issueIds: ['i1', 'i2'], knowledgeBaseId: 'kb1'},
        flags: {},
      },
    )
    expect(request.body).toEqual({issueIds: ['i1', 'i2']})
  })
})
