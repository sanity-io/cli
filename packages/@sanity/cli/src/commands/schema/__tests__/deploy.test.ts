import {getCliConfig, type Output} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {extractManifestSafe} from '../../../actions/manifest/extractManifest.js'
import {type CreateManifest} from '../../../actions/manifest/types.js'
import {createManifestReader} from '../../../actions/schema/utils/manifestReader.js'
import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {NO_DATASET_ID, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeploySchemaCommand} from '../deploy.js'

const silentOutput = {
  error: () => {
    throw new Error('Unexpected error in test')
  },
  log: () => {},
  warn: () => {},
} as unknown as Output

describe('#schema:deploy', {timeout: 30 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  describe('basic-studio', () => {
    let cwd: string
    let projectId: string
    let dataset: string

    beforeAll(async () => {
      cwd = await testFixture('basic-studio')
      const config = await getCliConfig(cwd)
      projectId = config.api!.projectId!
      dataset = config.api!.dataset!
    })

    test('should deploy schema for single workspace', async () => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas`,
      }).reply(200, undefined)

      const {error, stdout} = await testCommand(DeploySchemaCommand)

      expect(error).toBeUndefined()
      expect(stdout).toContain('Deployed 1/1 schemas')
      expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
    })

    test('should enable verbose logging with verbose flag', async () => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas`,
      }).reply(200, undefined)

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--verbose'])

      expect(error).toBeUndefined()
      expect(stdout).toContain(
        `↳ schemaId: _.schemas.default, projectId: ${projectId}, dataset: ${dataset}`,
      )
    })

    test.each([
      {dataset: 'valid', desc: 'no project ID', expectedError: NO_PROJECT_ID, projectId: undefined},
      {dataset: 'valid', desc: 'empty project ID', expectedError: NO_PROJECT_ID, projectId: ''},
      {dataset: undefined, desc: 'no dataset', expectedError: NO_DATASET_ID, projectId: 'valid'},
      {dataset: '', desc: 'empty dataset', expectedError: NO_DATASET_ID, projectId: 'valid'},
    ])(
      'throws error when $desc',
      async ({
        dataset: ds,
        expectedError,
        projectId: pid,
      }: {
        dataset: string | undefined
        desc: string
        expectedError: string
        projectId: string | undefined
      }) => {
        process.chdir(cwd)
        const api = {dataset: ds, projectId: pid}

        const {error} = await testCommand(DeploySchemaCommand, [], {
          mocks: {
            cliConfig: {api},
            projectRoot: {directory: cwd, path: `${cwd}/sanity.config.ts`, type: 'studio'},
          },
        })

        expect(error?.message).toContain(expectedError)
        expect(error?.oclif?.exit).toBe(1)
      },
    )

    test.each([{flag: 'tag'}, {flag: 'workspace'}])(
      'throws error when $flag flag is empty string',
      async ({flag}: {flag: string}) => {
        process.chdir(cwd)

        const {error} = await testCommand(DeploySchemaCommand, [`--${flag}`, ''])

        expect(error?.message).toContain(`${flag} argument is empty`)
      },
    )

    test.each([
      {desc: 'contains period', expectedError: 'tag cannot contain . (period)', tag: 'test.tag'},
      {desc: 'starts with dash', expectedError: 'tag cannot start with - (dash)', tag: '-testtag'},
      {
        desc: 'contains invalid character (space)',
        expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
        tag: 'test tag',
      },
      {
        desc: 'contains invalid character (@)',
        expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
        tag: 'test@tag',
      },
      {
        desc: 'contains invalid character (!)',
        expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
        tag: 'test!',
      },
      {
        desc: 'contains multiple periods',
        expectedError: 'tag cannot contain . (period)',
        tag: 'test.tag.name',
      },
    ])(
      'throws error when tag $desc',
      async ({expectedError, tag}: {desc: string; expectedError: string; tag: string}) => {
        process.chdir(cwd)

        const {error} = await testCommand(DeploySchemaCommand, ['--tag', tag])

        expect(error?.message).toContain(expectedError)
        expect(error?.oclif?.exit).toBe(2)
      },
    )

    test.each([
      {desc: 'alphanumeric', tag: 'v1'},
      {desc: 'underscore', tag: 'feature_branch'},
      {desc: 'dash in middle', tag: 'test-tag'},
      {desc: 'mixed case', tag: 'TestTag123'},
    ])('accepts valid tag: $desc', async ({tag}: {desc: string; tag: string}) => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas`,
      }).reply(200, undefined)

      const {error} = await testCommand(DeploySchemaCommand, ['--tag', tag])
      expect(error).toBeUndefined()
    })

    test('throws an error if workspace is not found', async () => {
      process.chdir(cwd)

      const {error} = await testCommand(DeploySchemaCommand, ['--workspace', 'nonexistent'])

      expect(error?.message).toContain('Found no workspaces named "nonexistent"')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('throws an error if schema request fails', async () => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas`,
      }).reply(400, {error: 'Bad request'})

      const {error} = await testCommand(DeploySchemaCommand)

      expect(error?.message).toContain('↳ Error when storing schemas')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('multi-workspace-studio', () => {
    let cwd: string
    let projectId: string
    let manifest: CreateManifest

    beforeAll(async () => {
      cwd = await testFixture('multi-workspace-studio')
      const config = await getCliConfig(cwd)
      projectId = config.api!.projectId!

      process.chdir(cwd)
      await extractManifestSafe({outPath: './dist/static', output: silentOutput})
      const reader = createManifestReader({
        manifestDir: './dist/static',
        output: silentOutput,
        workDir: cwd,
      })
      manifest = await reader.getManifest()
    })

    test('should deploy schemas for multiple workspaces', async () => {
      process.chdir(cwd)

      for (const workspace of manifest.workspaces) {
        mockApi({
          apiVersion: SCHEMA_API_VERSION,
          method: 'put',
          uri: `/projects/${projectId}/datasets/${workspace.dataset}/schemas`,
        }).reply(200, undefined)
      }

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--no-extract-manifest'])

      expect(error).toBeUndefined()
      expect(stdout).toContain(
        `Deployed ${manifest.workspaces.length}/${manifest.workspaces.length} schemas`,
      )
      expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
    })

    test('should deploy a specific schema based on workspace flag', async () => {
      process.chdir(cwd)

      const productionWorkspace = manifest.workspaces.find((w) => w.name === 'production')!

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${productionWorkspace.dataset}/schemas`,
      }).reply(200, undefined)

      const {error, stdout} = await testCommand(DeploySchemaCommand, [
        '--workspace',
        'production',
        '--no-extract-manifest',
      ])

      expect(error).toBeUndefined()
      expect(stdout).toContain('Deployed 1/1 schemas')
      expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
    })

    test('throws an error if some schemas fail to deploy', async () => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${manifest.workspaces[0].dataset}/schemas`,
      }).reply(200, undefined)
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${manifest.workspaces[1].dataset}/schemas`,
      }).reply(404, undefined)

      const {error, stdout} = await testCommand(DeploySchemaCommand, ['--no-extract-manifest'])

      expect(error?.message).toContain(
        'Failed to deploy 1/2 schemas. Successfully deployed 1/2 schemas.',
      )
      expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('throws an error if schema request fails due to permissions', async () => {
      process.chdir(cwd)

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${manifest.workspaces[0].dataset}/schemas`,
      }).reply(401)
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/${manifest.workspaces[1].dataset}/schemas`,
      }).reply(200, undefined)

      const {stderr} = await testCommand(DeploySchemaCommand, ['--no-extract-manifest'])

      expect(stderr).toContain(
        `↳ No permissions to write schema for workspace "${manifest.workspaces[0].name}"`,
      )
    })
  })
})
