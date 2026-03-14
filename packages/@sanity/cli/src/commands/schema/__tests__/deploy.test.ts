import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

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

      const {error, stderr, stdout} = await testCommand(DeploySchemaCommand, [])

      expect(stderr).toContain('Deployed 1/1 schemas')
      expect(stdout).toContain('sanity schema list')
      if (error) throw error
    })

    test('sends extracted ManifestSchemaType[] in the request body, not the runtime Schema object', async () => {
      let capturedBody: Record<string, unknown> | undefined

      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, (_uri, body) => {
        capturedBody = body as Record<string, unknown>
        return {}
      })

      const {error} = await testCommand(DeploySchemaCommand, [])
      if (error) throw error

      // --- Envelope ---
      expect(capturedBody).toBeDefined()
      const schemas = capturedBody!.schemas as Record<string, unknown>[]
      expect(schemas).toHaveLength(1)

      const entry = schemas[0]
      expect(entry.version).toBe('2025-05-01')
      expect(entry.workspace).toHaveProperty('name', 'default')

      // --- Schema must be ManifestSchemaType[], not a runtime Schema object ---
      const schema = entry.schema as Record<string, unknown>[]
      expect(Array.isArray(schema)).toBe(true)
      expect(entry.schema).not.toHaveProperty('getTypeNames')
      expect(entry.schema).not.toHaveProperty('get')
      expect(entry.schema).not.toHaveProperty('_original')

      // Every entry must have name + type as strings
      for (const schemaType of schema) {
        expect(typeof schemaType.name).toBe('string')
        expect(typeof schemaType.type).toBe('string')
      }

      // All four fixture types present
      const byName = Object.fromEntries(schema.map((t) => [t.name, t]))
      expect(Object.keys(byName)).toEqual(
        expect.arrayContaining(['post', 'author', 'category', 'blockContent']),
      )

      // --- post: verify different field types are extracted ---
      const post = byName.post as Record<string, unknown>
      expect(post.type).toBe('document')
      const postFields = post.fields as Record<string, unknown>[]
      const pf = Object.fromEntries(postFields.map((f) => [f.name, f]))

      // string, slug, reference, image, array, datetime fields all present with correct types
      expect(pf.title.type).toBe('string')
      expect(pf.slug.type).toBe('slug')
      expect(pf.author.type).toBe('reference')
      expect(pf.mainImage.type).toBe('image')
      expect(pf.categories.type).toBe('array')
      expect(pf.publishedAt.type).toBe('datetime')
      expect(pf.body.type).toBe('blockContent')

      // slug options preserved
      expect(pf.slug.options).toEqual(expect.objectContaining({source: 'title', maxLength: 96}))
      // image hotspot option preserved
      expect(pf.mainImage.options).toEqual(expect.objectContaining({hotspot: true}))
      // reference `to` targets preserved
      expect(pf.author.to).toEqual(
        expect.arrayContaining([expect.objectContaining({type: 'author'})]),
      )
      // array `of` members with nested reference targets preserved
      expect(pf.categories.of).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'reference',
            to: expect.arrayContaining([expect.objectContaining({type: 'category'})]),
          }),
        ]),
      )

      // --- author: portable text field ---
      const authorFields = (byName.author as Record<string, unknown>).fields as Record<
        string,
        unknown
      >[]
      const af = Object.fromEntries(authorFields.map((f) => [f.name, f]))
      expect(af.bio.type).toBe('array')
      const bioBlock = (af.bio.of as Record<string, unknown>[]).find((m) => m.type === 'block')
      expect(bioBlock).toBeDefined()

      // --- category: text field type ---
      const catFields = (byName.category as Record<string, unknown>).fields as Record<
        string,
        unknown
      >[]
      const cf = Object.fromEntries(catFields.map((f) => [f.name, f]))
      expect(cf.description.type).toBe('text')

      // --- blockContent: array with block marks/styles/lists + image member ---
      const bc = byName.blockContent as Record<string, unknown>
      expect(bc.type).toBe('array')
      const bcOf = bc.of as Record<string, unknown>[]
      const bcBlock = bcOf.find((m) => m.type === 'block') as Record<string, unknown>
      expect(bcBlock).toBeDefined()

      // decorators
      const marks = bcBlock.marks as Record<string, unknown>
      expect(marks.decorators).toEqual(
        expect.arrayContaining([
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
        ]),
      )
      // annotations with nested object fields
      expect(marks.annotations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'object',
            name: 'link',
            fields: expect.arrayContaining([expect.objectContaining({name: 'href', type: 'url'})]),
          }),
        ]),
      )
      // styles
      expect(bcBlock.styles).toEqual(
        expect.arrayContaining([
          {title: 'Normal', value: 'normal'},
          {title: 'H1', value: 'h1'},
        ]),
      )
      // lists
      expect(bcBlock.lists).toEqual(expect.arrayContaining([{title: 'Bullet', value: 'bullet'}]))
      // image member with options
      const bcImage = bcOf.find((m) => m.type === 'image')
      expect(bcImage).toBeDefined()
      expect((bcImage as Record<string, unknown>).options).toEqual(
        expect.objectContaining({hotspot: true}),
      )
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

      const {error, stderr} = await testCommand(DeploySchemaCommand, ['--tag', 'mytag'])

      expect(stderr).toContain('Deployed 1/1 schemas')
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

  describe('basic-studio (invalid schema)', () => {
    test('should fail with validation errors for invalid schema (duplicate types)', async () => {
      const cwd = await testFixture('basic-studio')
      process.chdir(cwd)

      // Modify schema to have duplicate types
      const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
      const content = await readFile(schemaIndexPath, 'utf8')
      const modified = content.replace(
        'export const schemaTypes = [post, author, category, blockContent]',
        'export const schemaTypes = [post, post, author, category, blockContent]',
      )
      await writeFile(schemaIndexPath, modified)

      const {error, stdout} = await testCommand(DeploySchemaCommand, [])

      expect(stdout).toContain('[ERROR]')
      expect(stdout).toContain('A type with name "post" is already defined in the schema')
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

      const {error, stderr, stdout} = await testCommand(DeploySchemaCommand, [])

      expect(stderr).toContain('Deployed 2/2 schemas')
      expect(stdout).toContain('sanity schema list')
      if (error) throw error
    })

    test('deploys only production workspace with --workspace flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/test/schemas`,
      }).reply(200, {})

      const {error, stderr} = await testCommand(DeploySchemaCommand, ['--workspace', 'production'])

      expect(stderr).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })

    test('deploys only staging workspace with --workspace flag', async () => {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'put',
        uri: `/projects/${projectId}/datasets/staging/schemas`,
      }).reply(200, {})

      const {error, stderr} = await testCommand(DeploySchemaCommand, ['--workspace', 'staging'])

      expect(stderr).toContain('Deployed 1/1 schemas')
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

      const {error, stderr, stdout} = await testCommand(DeploySchemaCommand, ['--verbose'])

      expect(stderr).toContain('Deployed 2/2 schemas')
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

      const {error, stderr} = await testCommand(DeploySchemaCommand, [
        '--workspace',
        'production',
        '--tag',
        'mytag',
      ])

      expect(stderr).toContain('Deployed 1/1 schemas')
      if (error) throw error
    })
  })
})
