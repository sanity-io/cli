import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {GraphQLDeployCommand} from '../deploy.js'

const mockConfirm = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn())

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

describe('#graphql:deploy', {timeout: 30 * 1000}, () => {
  let cwd: string

  beforeAll(async () => {
    cwd = await testFixture('basic-studio')
    process.chdir(cwd)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending).toEqual([])
  })

  test('successfully deploys GraphQL API with no existing deployment', async () => {
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

  test('handles breaking and dangerous changes with --force flag', async () => {
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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
  })

  test('--playground flag overrides existing config', async () => {
    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'false', // Currently disabled
      })

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

    // Capture the request body to verify enablePlayground is true when --playground flag is passed
    let capturedBody: {enablePlayground?: boolean; schema?: unknown} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--playground'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
    expect(capturedBody?.enablePlayground).toBe(true)
  })

  test('prompts for playground in interactive mode for new deployment', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(true)

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

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Do you want to enable a GraphQL playground?',
      }),
    )
  })

  // Note: --with-union-cache is an internal optimization that caches union definitions
  // during schema generation. It doesn't change the output, only performance.
  // This test verifies the flag doesn't break the deploy command.
  test('supports --with-union-cache flag (smoke test)', async () => {
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

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--with-union-cache'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
  })

  test('prompts and allows user to decline dangerous changes', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(false)

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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('Found BREAKING changes')
    expect(stderr).not.toContain('Deployed!')
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Do you want to deploy a new API despite the dangerous changes?',
      }),
    )
  })

  test('validates without deploying and reports breaking changes (dry-run)', async () => {
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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'])

    expect(error).toBeUndefined()
    expect(stdout).toContain('GraphQL API is valid and has no breaking changes')
    expect(stdout).not.toContain('Project: ppsg7ml5')
    expect(stderr).not.toContain('Deployed!')
  })

  test('reports breaking changes and exits with code 1 (dry-run)', async () => {
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

    const {error, stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'], {
      config: {root: cwd},
    })

    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('renders dangerousChanges in output', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(false)

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
        {
          description: 'Enum value "ACTIVE" was added',
          type: 'ENUM_VALUE_ADDED',
        },
      ],
      validationError: null,
    })

    const {error, stdout} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('Found potentially dangerous changes from previous schema')
    expect(stdout).toContain('Field "count" changed type from "Int" to "String"')
    expect(stdout).toContain('Enum value "ACTIVE" was added')
  })

  test('prompts and allows user to accept dangerous changes in interactive mode', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(true) // User accepts the dangerous changes

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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('Found BREAKING changes')
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Do you want to deploy a new API despite the dangerous changes?',
      }),
    )
    expect(stderr).toContain('Deployed!')
  })
})
