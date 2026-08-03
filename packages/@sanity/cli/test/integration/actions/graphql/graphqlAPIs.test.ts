import {getCliConfig} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {beforeAll, describe, expect, test} from 'vitest'

import {extractGraphQLAPIs} from '../../../../src/actions/graphql/extractGraphQLAPIs.js'
import {getGraphQLAPIs} from '../../../../src/actions/graphql/getGraphQLAPIs.js'

describe('graphql APIs integration', {timeout: 60_000}, () => {
  let cwd: string
  let projectId: string

  beforeAll(async () => {
    cwd = await testFixture('graphql-studio')

    const cliConfig = await getCliConfig(cwd)
    projectId = cliConfig.api?.projectId ?? ''
  })

  describe('getGraphQLAPIs', () => {
    test('resolves both APIs from multi-workspace config and does not include extracted schema data', async () => {
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

      for (const api of apis) {
        expect(api.extracted).toBeUndefined()
        expect(api.schemaErrors).toBeUndefined()
        expect(api.extractionError).toBeUndefined()
      }
    })
  })

  describe('extractGraphQLAPIs', () => {
    test('resolves and extracts both APIs from multi-workspace config with workspace-specific types and interfaces', async () => {
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

      // production workspace does not have event, but staging does
      const prodTypeNames = production!.extracted!.types.map((t) => t.name)

      expect(prodTypeNames).toContain('Category')
      expect(prodTypeNames).not.toContain('Event')
      const stagingTypeNames = staging!.extracted!.types.map((t) => t.name)

      expect(stagingTypeNames).toContain('Event')
      expect(stagingTypeNames).toContain('Category')
    })
  })
})
