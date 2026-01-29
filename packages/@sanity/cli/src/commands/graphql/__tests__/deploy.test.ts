import {mockApi, testCommand, testExample} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {GraphQLDeployCommand} from '../deploy.js'

describe('#graphql:deploy', {timeout: 30 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending).toEqual([])
  })

  test('successfully deploys GraphQL API with no existing deployment', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project: ppsg7ml5')
    expect(stdout).toContain('Dataset: test')
    expect(stdout).toContain('Tag:')
    expect(stdout).toContain('default')
    expect(stdout).toContain('URL:')
    expect(stdout).toContain('https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default')
    expect(stderr).toContain('Deployed!')
  })

  test('handles breaking changes with --force flag', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
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

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    // With --force, changes are not rendered to stdout, just deployed
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
  })

  test('fails on breaking changes without --force flag in non-interactive mode', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
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

    const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Dangerous changes found')
    expect(error?.message).toContain('--force')
    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
  })

  test('validates without deploying in dry-run mode', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    // No PUT mock - should not deploy in dry-run mode

    const {error, stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('GraphQL API is valid and has no breaking changes')
    expect(stdout).not.toContain('Project: ppsg7ml5') // Deploy details not shown in dry-run
    expect(stdout).not.toContain('Deployed!')
  })

  test('handles validation errors', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: 'Invalid schema: type "Post" has no fields',
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('GraphQL schema is not valid')
    expect(error?.message).toContain('Invalid schema: type "Post" has no fields')
  })

  test('handles deploy failures', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(500, {
      error: 'Internal Server Error',
      message: 'Deploy failed due to server error',
      statusCode: 500,
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to deploy GraphQL API')
  })

  test('supports different generations via --generation flag', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr} = await testCommand(
      GraphQLDeployCommand,
      ['--force', '--generation', 'gen2'],
      {
        config: {root: cwd},
      },
    )

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
  })

  test('displays dangerous changes when present', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [
        {
          description: 'Field "count" changed type from "Int" to "String"',
          type: 'FIELD_CHANGED_TYPE',
        },
      ],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    // With --force, changes are not rendered to stdout, just deployed
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
  })
})
