import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {ListSchemaCommand} from '../list.js'

describe('#schema:list', {timeout: 60 * 1000}, () => {
  let projectId: string | undefined
  beforeAll(async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)
    const cliConfig = await getCliConfig(cwd)
    projectId = cliConfig.api?.projectId
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should list schemas in table format', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas`,
    }).reply(200, [
      {
        _createdAt: '2025-01-21T18:49:44Z',
        _id: '_.schemas.production',
        workspace: {name: 'production'},
      },
    ])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas`,
    }).reply(200, [
      {
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: {name: 'staging'},
      },
    ])

    const {stdout} = await testCommand(ListSchemaCommand, [])

    expect(stdout).toContain('_.schemas.production')
    expect(stdout).toContain('_.schemas.staging')
  })

  test('should list schemas in json format', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas`,
    }).reply(200, [
      {
        _createdAt: '2025-01-21T18:49:44Z',
        _id: '_.schemas.production',
        workspace: {name: 'production'},
      },
    ])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas`,
    }).reply(200, [
      {
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: {name: 'staging'},
      },
    ])

    const {stdout} = await testCommand(ListSchemaCommand, ['--json'])

    expect(stdout).toContain('"_id": "_.schemas.production"')
    expect(stdout).toContain('"_id": "_.schemas.staging"')
  })

  test('should list specific schema by id in table format', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.staging`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.staging`,
    }).reply(200, [
      {
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: {name: 'staging'},
      },
    ])

    const {stdout} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.staging'])

    expect(stdout).toContain('_.schemas.staging')
  })

  test('should list specific schema by id in json format', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.staging`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.staging`,
    }).reply(200, [
      {
        _createdAt: '2025-05-28T18:49:44Z',
        _id: '_.schemas.staging',
        workspace: {name: 'staging'},
      },
    ])

    const {stdout} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.staging', '--json'])

    expect(stdout).toContain('_.schemas.staging')
    expect(stdout).toContain('"_id"')
  })

  test.each([
    {
      desc: 'empty string',
      expectedError: 'id argument is empty',
      id: '',
    },
    {
      desc: 'invalid characters (!)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: 'test-id!!',
    },
    {
      desc: 'invalid characters (@)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: '_.schemas.production@tag',
    },
    {
      desc: 'starts with dash',
      expectedError: 'id cannot start with - (dash)',
      id: '-_.schemas.production',
    },
    {
      desc: 'consecutive periods',
      expectedError: 'id cannot have consecutive . (period) characters',
      id: '_.schemas..production',
    },
    {
      desc: 'missing required prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      id: 'schemas.production',
    },
    {
      desc: 'incorrect prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      id: 'sanity.schemas.production',
    },
    {
      desc: 'workspace name with invalid characters (space)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: '_.schemas.my workspace',
    },
  ])('throws error when id is $desc', async ({expectedError, id}) => {
    const {error} = await testCommand(ListSchemaCommand, ['--id', id])

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if no schemas are found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas`,
    }).reply(200, [])

    const {error} = await testCommand(ListSchemaCommand, [])

    expect(error?.message).toContain('No schemas found in datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if a specific schema based on id flag is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

    const {error} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.nonexistent'])

    expect(error?.message).toContain('Schema for id "_.schemas.nonexistent" not found in datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if schema request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas`,
    }).reply(400, {
      error: 'Bad request',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas`,
    }).reply(200, [])

    const {stdout} = await testCommand(ListSchemaCommand, [])

    expect(stdout).toContain('↳ Failed to fetch schema from "test":\n  Bad request')
  })

  test('prints warning if schema request fails due to permissions', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas`,
    }).reply(401)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas`,
    }).reply(200, [])

    const {stdout} = await testCommand(ListSchemaCommand, [])

    expect(stdout).toContain('↳ No permissions to read schema from "test".')
  })
})
