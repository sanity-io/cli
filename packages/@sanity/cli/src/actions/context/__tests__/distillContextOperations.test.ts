import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {contextOperations} from '../../../generated/contextOperations.js'
import {contextCommandTable} from '../commandTable.js'
import {commandClassName, commandFilePath, readContextSpec} from '../contextSpec.js'
import {type ContextOpenApiDocument, distillContextOperations} from '../distillContextOperations.js'

const PACKAGE_ROOT = join(import.meta.dirname, '../../../..')

const spec: ContextOpenApiDocument = {
  components: {
    schemas: {
      CrawlOptions: {
        properties: {
          includePaths: {description: 'Paths to crawl', items: {type: 'string'}, type: 'array'},
          maxDepth: {type: 'integer'},
        },
        type: 'object',
      },
    },
  },
  paths: {
    '/{apiVersion}/context/knowledge-bases/{knowledgeBaseId}/sources': {
      get: {
        operationId: 'listSources',
        parameters: [
          {in: 'path', name: 'knowledgeBaseId', schema: {type: 'string'}},
          {in: 'query', name: 'cursor', schema: {type: 'string'}},
          {in: 'query', name: 'includeDrafts', schema: {enum: ['true', 'false'], type: 'string'}},
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {properties: {data: {type: 'array'}, nextCursor: {type: 'string'}}},
              },
            },
          },
        },
        summary: 'List sources',
      },
      post: {
        description: 'Adds a source.',
        operationId: 'createSource',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    properties: {
                      crawlOptions: {$ref: '#/components/schemas/CrawlOptions'},
                      type: {enum: ['web'], type: 'string'},
                      url: {type: 'string'},
                    },
                    required: ['type', 'url'],
                    type: 'object',
                  },
                  {
                    properties: {
                      title: {type: 'string'},
                      type: {enum: ['files'], type: 'string'},
                    },
                    required: ['type', 'title'],
                    type: 'object',
                  },
                ],
              },
            },
          },
          required: true,
        },
        responses: {
          202: {content: {'application/json': {schema: {properties: {jobId: {type: 'string'}}}}}},
        },
        summary: 'Add a source',
      },
    },
    '/{apiVersion}/context/knowledge-bases/{knowledgeBaseId}/sources/{sourceId}': {
      delete: {operationId: 'deleteSource', responses: {204: {}}, summary: 'Delete a source'},
      patch: {
        operationId: 'updateSource',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  instructions: {nullable: true, type: 'string'},
                  metadata: {type: 'object'},
                  syncFrequency: {enum: ['weekly', 'monthly', null], type: ['string', 'null']},
                  title: {anyOf: [{type: 'string'}, {type: 'null'}]},
                },
                type: 'object',
              },
            },
          },
        },
        responses: {200: {}},
        summary: 'Update a source',
      },
    },
  },
}

const objectOf = (properties: Record<string, unknown>) => ({properties, type: 'object'})

function withBody(properties: Record<string, unknown>): ContextOpenApiDocument {
  return {
    paths: {
      '/{apiVersion}/context/knowledge-bases': {
        post: {
          operationId: 'op',
          requestBody: {content: {'application/json': {schema: objectOf(properties)}}},
          responses: {200: {}},
        },
      },
    },
  }
}

describe('distillContextOperations', () => {
  const operations = distillContextOperations(spec, [
    'listSources',
    'createSource',
    'updateSource',
    'deleteSource',
  ])

  test('a route without the version prefix, path parameters in path order, and query fields', () => {
    expect(operations.listSources).toMatchObject({
      body: 'none',
      paginated: true,
      pathParams: [{name: 'knowledgeBaseId'}],
      route: 'GET /knowledge-bases/{knowledgeBaseId}/sources',
      summary: 'List sources',
    })
    expect(operations.listSources.fields).toEqual([
      {in: 'query', name: 'cursor', type: 'string'},
      {in: 'query', name: 'includeDrafts', type: 'boolean'},
    ])
    expect(operations.deleteSource.pathParams.map((param) => param.name)).toEqual([
      'knowledgeBaseId',
      'sourceId',
    ])
    expect(operations.deleteSource.noContent).toBe(true)
  })

  test('merges body variants, marking the fields only some variants have', () => {
    const {fields, startsJob} = operations.createSource
    expect(startsJob).toBe(true)
    expect(fields).toEqual([
      {
        description: 'Paths to crawl',
        in: 'body',
        name: 'includePaths',
        parent: 'crawlOptions',
        type: 'string[]',
        variants: ['web'],
      },
      {in: 'body', name: 'maxDepth', parent: 'crawlOptions', type: 'integer', variants: ['web']},
      {in: 'body', name: 'type', options: ['web', 'files'], required: true, type: 'string'},
      {in: 'body', name: 'url', type: 'string', variants: ['web']},
      {in: 'body', name: 'title', type: 'string', variants: ['files']},
    ])
  })

  test('nullable fields and free-form objects', () => {
    expect(operations.updateSource.body).toBe('optional')
    expect(operations.updateSource.fields).toEqual([
      {in: 'body', name: 'instructions', nullable: true, type: 'string'},
      {in: 'body', name: 'metadata', type: 'json'},
      {
        in: 'body',
        name: 'syncFrequency',
        nullable: true,
        options: ['weekly', 'monthly'],
        type: 'string',
      },
      {in: 'body', name: 'title', nullable: true, type: 'string'},
    ])
  })

  test('keeps the full path of a field nested more than one level deep', () => {
    const nested = distillContextOperations(
      withBody({limits: objectOf({crawl: objectOf({pages: {type: 'integer'}})})}),
      ['op'],
    )
    expect(nested.op.fields).toEqual([
      {in: 'body', name: 'pages', parent: 'limits.crawl', type: 'integer'},
    ])
  })

  test('leaves out deprecated query parameters and body fields', () => {
    const distilled = distillContextOperations(
      {
        paths: {
          '/{apiVersion}/context/knowledge-bases': {
            post: {
              operationId: 'op',
              parameters: [
                {in: 'query', name: 'mode', schema: {type: 'string'}},
                {deprecated: true, in: 'query', name: 'perspective', schema: {type: 'string'}},
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: objectOf({
                      groqFilter: {deprecated: true, type: 'string'},
                      title: {type: 'string'},
                    }),
                  },
                },
              },
              responses: {200: {}},
            },
          },
        },
      },
      ['op'],
    )
    expect(distilled.op.fields.map((item) => item.name)).toEqual(['mode', 'title'])
  })

  test('fails when two fields, or a field and a command flag, would share a flag', () => {
    expect(() =>
      distillContextOperations(
        withBody({
          a: objectOf({depth: {type: 'integer'}}),
          b: objectOf({depth: {type: 'integer'}}),
        }),
        ['op'],
      ),
    ).toThrow('Field "depth" of op would collide with another flag')
    expect(() => distillContextOperations(withBody({watch: {type: 'boolean'}}), ['op'])).toThrow(
      'Field "watch" of op would collide with another flag',
    )
  })

  test('refuses an operation the spec lacks', () => {
    expect(() => distillContextOperations(spec, ['listImports'])).toThrow(
      'Operations missing from the Context API spec: listImports',
    )
  })
})

describe('generated context commands', () => {
  test('the generated operations match the spec @sanity/client vendors', () => {
    const fresh = distillContextOperations(
      readContextSpec(),
      contextCommandTable.map((entry) => entry.operationId),
    )
    expect(contextOperations).toEqual(fresh)
  })

  test('every generated entry of the command table has its command file', () => {
    for (const entry of contextCommandTable) {
      if ('handWritten' in entry) continue
      const file = join(PACKAGE_ROOT, commandFilePath(entry.id))
      expect(existsSync(file), `${file} is missing; run pnpm generate:context-commands`).toBe(true)
      expect(readFileSync(file, 'utf8')).toContain(
        `export const ${commandClassName(entry.operationId)} = contextCommand('${entry.id}')`,
      )
    }
  })
})
