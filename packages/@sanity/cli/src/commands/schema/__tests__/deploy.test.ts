import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {DeploySchemaCommand} from '../deploy.js'

describe('#schema:deploy', {timeout: 60 * 1000}, () => {
  describe('basic-studio', () => {
    let projectId: string | undefined
    beforeAll(async () => {
      const cwd = await testFixture('basic-studio')
      process.chdir(cwd)
      const cliConfig = await getCliConfig(cwd)
      projectId = cliConfig.api?.projectId
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    test('deploys schema for single workspace', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, [])

      expect(stdout).toContain('Deployed 1/1 schemas')
      expect(stdout).toContain('sanity schema list')
      if (error) throw error
    })

    test('deploys with --verbose flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--verbose'])

      expect(stdout).toContain('schemaId:')
      expect(stdout).toContain(projectId)
      expect(stdout).toContain('dataset: test')
      if (error) throw error
    })

    test('deploys with --tag flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--tag', 'mytag'])

      expect(stdout).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })

    test.each([
      {desc: 'empty tag', expectedError: 'tag argument is empty', tag: ''},
      {
        desc: 'tag containing period',
        expectedError: 'tag cannot contain . (period)',
        tag: 'my.tag',
      },
      {
        desc: 'tag starting with dash',
        expectedError: 'tag cannot start with - (dash)',
        tag: '-mytag',
      },
      {
        desc: 'tag with invalid characters',
        expectedError: 'tag can only contain characters in',
        tag: 'my@tag',
      },
    ])('throws error for $desc', async ({expectedError, tag}) => {
      const {error} = await testCommand(DeploySchemaCommand, ['--tag', tag])

      expect(error?.message).toContain(expectedError)
      expect(error?.oclif?.exit).toBe(2)
    })

    test('handles API 401 permission error', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(401, {message: 'Unauthorized'})

      const {error, stderr} = await testCommand(DeploySchemaCommand, [])

      expect(error?.oclif?.exit).toBe(1)
      expect(stderr).toContain('No permissions')
    })

    test('handles API 500 error', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(500, {message: 'Internal Server Error'})

      const {error} = await testCommand(DeploySchemaCommand, [])

      expect(error?.message).toContain('Failed to deploy schemas')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('multi-workspace-studio', () => {
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

    test('deploys all workspaces', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/staging/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, [])

      expect(stdout).toContain('Deployed 2/2 schemas')
      expect(stdout).toContain('sanity schema list')
      if (error) throw error
    })

    test('deploys only production workspace with --workspace flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--workspace', 'production'])

      expect(stdout).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })

    test('deploys only staging workspace with --workspace flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/staging/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--workspace', 'staging'])

      expect(stdout).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })

    test('throws error for non-existent workspace', async () => {
      const {error} = await testCommand(DeploySchemaCommand, ['--workspace', 'nonexistent'])

      expect(error?.message).toContain('Found no workspaces named "nonexistent"')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles partial failure when one workspace fails', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/staging/schemas`,
      }).reply(500, {message: 'Internal Server Error'})

      const {error} = await testCommand(DeploySchemaCommand, [])

      expect(error?.message).toContain('Failed to deploy')
      expect(error?.message).toContain('1/2')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('deploys all workspaces with --verbose flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/staging/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--verbose'])

      expect(stdout).toContain('Deployed 2/2 schemas')
      expect(stdout).toContain('dataset: test')
      expect(stdout).toContain('dataset: staging')
      if (error) throw error
    })

    test('deploys workspace with --workspace and --tag flags', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stdout} = await testCommand(DeploySchemaCommand, [
        '--workspace',
        'production',
        '--tag',
        'mytag',
      ])

      expect(stdout).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })
  })
})
