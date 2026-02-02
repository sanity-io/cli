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

describe('#graphql:deploy generation', {timeout: 30 * 1000}, () => {
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

  test('uses specified generation flag and maintains existing', async () => {
    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
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

    let capturedBody: {enablePlayground?: boolean; schema?: {generation?: string}} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
    expect(capturedBody?.schema?.generation).toBe('gen2')
  })

  test('changes generation with --force from gen2 to gen3', async () => {
    mockIsInteractive.mockReturnValue(false)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
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

    let capturedBody: {enablePlayground?: boolean; schema?: {generation?: string}} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [
      '--generation',
      'gen3',
      '--force',
    ])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Specified generation (gen3)')
    expect(stderr).toContain('currently deployed (gen2)')
    expect(stderr).toContain('Deployed!')
    expect(capturedBody?.schema?.generation).toBe('gen3')
  })

  test('prompts for generation change in interactive mode and user declines', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(false) // User declines the generation change

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Specified generation (gen3)')
    expect(stderr).toContain('currently deployed (gen2)')
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Are you sure you want to deploy?',
      }),
    )
    expect(stderr).not.toContain('Deployed!')
  })

  test('fails changing generation in non-interactive mode without --force', async () => {
    mockIsInteractive.mockReturnValue(false)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Specified generation (gen3)')
    expect(error?.message).toContain('differs from the one currently deployed (gen2)')
    expect(error?.message).toContain('--force')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('changes generation in interactive mode when user confirms', async () => {
    mockIsInteractive.mockReturnValue(true)
    mockConfirm.mockResolvedValue(true) // User confirms the generation change

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
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

    let capturedBody: {enablePlayground?: boolean; schema?: {generation?: string}} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Specified generation (gen3)')
    expect(stderr).toContain('currently deployed (gen2)')
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Are you sure you want to deploy?',
      }),
    )
    expect(stderr).toContain('Deployed!')
    expect(capturedBody?.schema?.generation).toBe('gen3')
  })

  test('deploys with gen1 generation', async () => {
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

    let capturedBody: {enablePlayground?: boolean; schema?: {generation?: string}} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen1'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
    expect(capturedBody?.schema?.generation).toBe('gen1')
  })

  test('uses specified generation when it matches currently deployed', async () => {
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
      dangerousChanges: [],
      validationError: null,
    })

    let capturedBody: {enablePlayground?: boolean; schema?: {generation?: string}} | undefined
    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, function (_, requestBody) {
      capturedBody = requestBody as typeof capturedBody
      return {location: '/v1/graphql/test/default'}
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
    // Should not warn about generation mismatch
    expect(stderr).not.toContain('Specified generation')
    expect(capturedBody?.schema?.generation).toBe('gen3')
  })
})
