import {getCliConfig} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {beforeAll, describe, expect, test} from 'vitest'

import {extractGraphQLAPIs} from '../extractGraphQLAPIs.js'
import {getGraphQLAPIs} from '../getGraphQLAPIs.js'

describe('graphql APIs integration', {timeout: 60_000}, () => {
  let cwd: string
  let projectId: string

  beforeAll(async () => {
    cwd = await testFixture('graphql-studio')
    process.chdir(cwd)

    const cliConfig = await getCliConfig(cwd)
    projectId = cliConfig.api?.projectId ?? ''
  })

  describe('getGraphQLAPIs', () => {
    test('resolves both APIs from multi-workspace config', async () => {
      const apis = await getGraphQLAPIs(cwd)

      expect(apis).toHaveLength(2)

      const production = apis.find((api) => api.id === 'production-api')
      const staging = apis.find((api) => api.id === 'staging-api')

      expect(production).toMatchObject({
        dataset: 'production',
        id: 'production-api',
        projectId,
        tag: 'default',
      })

      expect(staging).toMatchObject({
        dataset: 'staging',
        id: 'staging-api',
        projectId,
        tag: 'staging',
      })
    })

    test('does not include extracted schema data', async () => {
      const apis = await getGraphQLAPIs(cwd)

      for (const api of apis) {
        expect(api.extracted).toBeUndefined()
        expect(api.schemaErrors).toBeUndefined()
        expect(api.extractionError).toBeUndefined()
      }
    })
  })

  describe('extractGraphQLAPIs', () => {
    test('resolves and extracts both APIs from multi-workspace config', async () => {
      const apis = await extractGraphQLAPIs(cwd, {})

      expect(apis).toHaveLength(2)

      const production = apis.find((api) => api.id === 'production-api')
      const staging = apis.find((api) => api.id === 'staging-api')

      expect(production).toMatchObject({
        dataset: 'production',
        id: 'production-api',
        projectId,
        tag: 'default',
      })

      expect(staging).toMatchObject({
        dataset: 'staging',
        id: 'staging-api',
        projectId,
        tag: 'staging',
      })
    })

    test('extracts schema data with types and interfaces', async () => {
      const apis = await extractGraphQLAPIs(cwd, {})

      for (const api of apis) {
        expect(api.extracted).toBeDefined()
        expect(api.schemaErrors).toBeUndefined()
        expect(api.extractionError).toBeUndefined()

        // Both workspaces share Post and Author
        const typeNames = api.extracted!.types.map((t) => t.name)
        expect(typeNames).toContain('Post')
        expect(typeNames).toContain('Author')

        // Should have the Document interface
        const interfaceNames = api.extracted!.interfaces.map((i) => i.name)
        expect(interfaceNames).toContain('Document')
      }
    })

    test('production workspace does not have Event', async () => {
      const apis = await extractGraphQLAPIs(cwd, {})
      const production = apis.find((api) => api.id === 'production-api')!
      const typeNames = production.extracted!.types.map((t) => t.name)

      expect(typeNames).toContain('Category')
      expect(typeNames).not.toContain('Event')
    })

    test('staging workspace has Event (in addition to shared types)', async () => {
      const apis = await extractGraphQLAPIs(cwd, {})
      const staging = apis.find((api) => api.id === 'staging-api')!
      const typeNames = staging.extracted!.types.map((t) => t.name)

      expect(typeNames).toContain('Event')
      expect(typeNames).toContain('Category')
    })
  })
})
