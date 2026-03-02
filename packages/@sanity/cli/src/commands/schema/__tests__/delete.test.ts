import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteSchemaCommand} from '../delete.js'

const schemaIds = ['_.schemas.production', '_.schemas.staging']

describe('#schema:delete', {timeout: 60 * 1000}, () => {
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

  test('successfully deletes a single schema', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, {deleted: true})

    const {error, stdout} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production',
    ])

    expect(stdout).toContain('Successfully deleted 1/1 schemas')
    if (error) throw error
  })

  test('successfully deletes multiple schemas', async () => {
    for (const schema of schemaIds) {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/${projectId}/datasets/test/schemas/${schema}`,
      }).reply(200, [{}])
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/${projectId}/datasets/staging/schemas/${schema}`,
      }).reply(200, [{}])
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/${projectId}/datasets/test/schemas/${schema}`,
      }).reply(200, {deleted: true})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/${projectId}/datasets/staging/schemas/${schema}`,
      }).reply(200, {deleted: true})
    }

    const {error, stdout} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production,_.schemas.staging',
    ])

    expect(stdout).toContain('Successfully deleted 2/2 schemas')
    if (error) throw error
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, {deleted: true})

    const {error, stdout} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production',
      '--dataset',
      'test',
    ])

    expect(stdout).toContain('Successfully deleted 1/1 schemas')
    if (error) throw error
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws an error if $desc', async ({projectId: testProjectId}) => {
    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.production'], {
      mocks: {cliConfig: {api: {dataset: 'test', projectId: testProjectId}}},
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if ids is an empty string', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, ['--ids'])

    expect(error?.message).toContain('Flag --ids expects a value')
    expect(error?.oclif?.exit).toBe(2)
  })

  test.each([
    {
      desc: 'ids with invalid characters (!)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: 'test-id!!',
    },
    {
      desc: 'ids with invalid characters (@)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: '_.schemas.default@tag',
    },
    {
      desc: 'id starts with dash',
      expectedError: 'id cannot start with - (dash)',
      ids: '-_.schemas.default',
    },
    {
      desc: 'id has consecutive periods',
      expectedError: 'id cannot have consecutive . (period) characters',
      ids: '_.schemas..default',
    },
    {
      desc: 'id missing required prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      ids: 'schemas.default',
    },
    {
      desc: 'id has invalid workspace name (space)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: '_.schemas.default workspace',
    },
    {
      desc: 'duplicate ids in comma-separated list',
      expectedError: 'ids contains duplicates',
      ids: '_.schemas.default,_.schemas.default',
    },
    {
      desc: 'comma-separated with one duplicate',
      expectedError: 'ids contains duplicates',
      ids: '_.schemas.production,_.schemas.staging,_.schemas.production',
    },
    {
      desc: 'all entries are empty after trimming',
      expectedError: 'ids contains no valid id strings',
      ids: ' , , ',
    },
  ])('throws error when $desc', async ({expectedError, ids}) => {
    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', ids])

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(2)
  })

  test('throws error when dataset flag is not provided a value', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production',
      '--dataset',
    ])

    expect(error?.message).toContain('Flag --dataset expects a value')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('throws an error when schema is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.nonexistent'])

    expect(error?.message).toContain('Deleted 0/1 schemas')
    expect(error?.message).toContain('not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error when some schemas are not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production,_.schemas.nonexistent',
    ])

    expect(error?.message).toContain('Deleted 1/2 schemas')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if delete request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(403, {
      error: 'Delete failed',
    })

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.production'])

    expect(error?.message).toContain('Failed to delete ids')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('outputs a verbose warning when verbose flag is enabled', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(200, [{}])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/test/schemas/_.schemas.production`,
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: `/projects/${projectId}/datasets/staging/schemas/_.schemas.production`,
    }).reply(403, {
      error: 'Delete failed',
    })

    const {error, stderr} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.production',
      '--verbose',
    ])

    expect(stderr).toContain('Failed to delete schema "_.schemas.production"')
    expect(stderr).toContain('DeleteIdError: Delete failed')
    expect(error?.message).toContain('Deleted 0/1 schemas')
    expect(error?.oclif?.exit).toBe(1)
  })
})
