import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {List} from '../list.js'

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays GraphQL endpoints correctly with multiple endpoints', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, [
      {
        dataset: 'production',
        generation: 'gen2',
        playgroundEnabled: true,
        projectId: testProjectId,
        tag: 'default',
      },
      {
        dataset: 'staging',
        generation: 'gen3',
        playgroundEnabled: false,
        projectId: testProjectId,
        tag: 'latest',
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toMatchInlineSnapshot(`
      "Here are the GraphQL endpoints deployed for this project:
      1.  Dataset:     production
          Tag:         default
          Generation:  gen2
          Playground:  true
          URL:  https://test-project.api.sanity.io/v2025-09-19/graphql/production/default

      2.  Dataset:     staging
          Tag:         latest
          Generation:  gen3
          Playground:  false
          URL:  https://test-project.api.sanity.io/v2025-09-19/graphql/staging/latest

      "
    `)
  })

  test('displays single GraphQL endpoint correctly', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, [
      {
        dataset: 'production',
        generation: 'gen2',
        playgroundEnabled: true,
        projectId: testProjectId,
        tag: 'default',
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toMatchInlineSnapshot(`
      "Here are the GraphQL endpoints deployed for this project:
      1.  Dataset:     production
          Tag:         default
          Generation:  gen2
          Playground:  true
          URL:  https://test-project.api.sanity.io/v2025-09-19/graphql/production/default

      "
    `)
  })

  test('handles empty GraphQL endpoints list', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, [])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe("This project doesn't have any GraphQL endpoints deployed.\n")
  })

  test('handles null/undefined GraphQL endpoints response', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, undefined)

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toBe("This project doesn't have any GraphQL endpoints deployed.\n")
  })

  test.each([
    [404, 'Project not found'],
    [500, 'Internal Server Error'],
  ])(
    'displays error when API request fails with %i status and message "%s"',
    async (status, message) => {
      mockApi({
        apiVersion: GRAPHQL_API_VERSION,
        projectId: testProjectId,
        uri: '/apis/graphql',
      }).reply(status, {message})

      const {error} = await testCommand(List, [], {mocks: defaultMocks})

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('GraphQL endpoints list retrieval failed')
      expect(error?.message).toContain(message)
      expect(error?.oclif?.exit).toBe(1)
    },
  )

  test('throws error when project ID is not defined', async () => {
    const {error} = await testCommand(List, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays endpoints correctly when dataset names contain special characters', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, [
      {
        dataset: 'my-dataset-123',
        generation: 'gen2',
        playgroundEnabled: true,
        projectId: testProjectId,
        tag: 'v1.0.0',
      },
      {
        dataset: 'test_dataset',
        generation: 'gen3',
        playgroundEnabled: false,
        projectId: testProjectId,
        tag: 'beta-2',
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toContain('Dataset:     my-dataset-123')
    expect(stdout).toContain('Tag:         v1.0.0')
    expect(stdout).toContain('Dataset:     test_dataset')
    expect(stdout).toContain('Tag:         beta-2')
  })

  test('displays endpoints with various generation values correctly', async () => {
    mockApi({
      apiVersion: GRAPHQL_API_VERSION,
      projectId: testProjectId,
      uri: '/apis/graphql',
    }).reply(200, [
      {
        dataset: 'production',
        generation: 'gen1',
        playgroundEnabled: true,
        projectId: testProjectId,
        tag: 'default',
      },
      {
        dataset: 'staging',
        generation: 'gen3',
        playgroundEnabled: false,
        projectId: testProjectId,
        tag: 'default',
      },
    ])

    const {stdout} = await testCommand(List, [], {mocks: defaultMocks})

    expect(stdout).toContain('Generation:  gen1')
    expect(stdout).toContain('Generation:  gen3')
  })
})
