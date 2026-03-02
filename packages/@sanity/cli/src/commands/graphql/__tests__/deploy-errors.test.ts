import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {GraphQLDeployCommand} from '../deploy.js'

const mockIsInteractive = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mockConfirm,
  }
})

describe('#graphql:deploy errors', {timeout: 60 * 1000}, () => {
  let cwd: string
  let projectId: string
  let dataset: string

  beforeAll(async () => {
    cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const cliConfig = await getCliConfig(cwd)
    projectId = cliConfig.api?.projectId ?? ''
    dataset = cliConfig.api?.dataset ?? ''
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending).toEqual([])
  })

  test('fails on breaking changes without --force in non-interactive mode', async () => {
    nock(`https://${projectId}.api.sanity.io`)
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/${dataset}/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: `https://${projectId}.api.sanity.io`,
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: `/apis/graphql/${dataset}/default/validate`,
    }).reply(200, {
      breakingChanges: [
        {
          description: 'Field "oldField" was removed from object type "Post"',
          type: 'FIELD_REMOVED',
        },
      ],
      dangerousChanges: [],
      validationError: null,
    })

    const {error, stdout} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Dangerous changes found')
    expect(error?.message).toContain('--force')
    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles validation errors', async () => {
    nock(`https://${projectId}.api.sanity.io`)
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/${dataset}/default`)
      .reply(404)

    mockApi({
      apiHost: `https://${projectId}.api.sanity.io`,
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: `/apis/graphql/${dataset}/default/validate`,
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: 'Invalid schema: type "Post" has no fields',
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('GraphQL schema is not valid')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles deploy failures', async () => {
    nock(`https://${projectId}.api.sanity.io`)
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/${dataset}/default`)
      .reply(404)

    mockApi({
      apiHost: `https://${projectId}.api.sanity.io`,
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: `/apis/graphql/${dataset}/default/validate`,
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: `https://${projectId}.api.sanity.io`,
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: `/apis/graphql/${dataset}/default`,
    }).reply(500, {
      error: 'Internal Server Error',
      message: 'Deploy failed',
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to deploy GraphQL API')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles getCurrentSchemaProps 500 error', async () => {
    nock(`https://${projectId}.api.sanity.io`)
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/${dataset}/default`)
      .reply(500)

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to get current GraphQL schema properties')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('rejects invalid --generation flag', async () => {
    const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen4'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('--generation=gen4 to be one of: gen1, gen2, gen3')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('rejects invalid API ID', async () => {
    const {error} = await testCommand(GraphQLDeployCommand, ['--api', 'MyAPI'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('GraphQL API with id "MyAPI" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles failure with invalid schema', async () => {
    // Create a separate fixture for this test to avoid affecting other tests
    const testCwd = await testFixture('basic-studio')

    // Modify the schema to have an invalid type reference
    const invalidSchema = `import {defineField} from 'sanity'

import author from './author'
import blockContent from './blockContent'
import category from './category'
import post from './post'

export const schemaTypes = [
  post,
  author,
  category,
  blockContent,
  defineField({
    name: 'incorrectType',
    type: 'incorrectType',
  }),
]
`
    await writeFile(join(testCwd, 'schemaTypes', 'index.ts'), invalidSchema)

    const {error} = await testCommand(GraphQLDeployCommand, [], {
      mocks: {
        projectRoot: {
          directory: testCwd,
          path: join(testCwd, 'sanity.config.ts'),
          type: 'studio',
        },
      },
    })

    expect(error).toBeDefined()
    // A self-referencing type (type: 'incorrectType' with name: 'incorrectType') triggers
    // either schema validation errors or a worker crash depending on the Sanity version.
    // Both paths end up in deploy's catch block with a message containing one of these.
    expect(error?.message).toMatch(
      /Fix the schema errors above and try again|Failed to resolve GraphQL APIs/,
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles validateGraphQLAPI network error with response body', async () => {
    nock(`https://${projectId}.api.sanity.io`)
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/${dataset}/default`)
      .reply(404)

    mockApi({
      apiHost: `https://${projectId}.api.sanity.io`,
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: `/apis/graphql/${dataset}/default/validate`,
    }).reply(400, {
      validationError: 'Schema validation failed: duplicate type name',
    })

    const {error} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Schema validation failed: duplicate type name')
    expect(error?.oclif?.exit).toBe(1)
  })
})
