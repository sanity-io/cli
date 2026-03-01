import {type Schema} from '@sanity/types'
import {describe, expect, test} from 'vitest'

import {resolveGraphQLApis, type Workspace} from '../resolveGraphQLApisFromWorkspaces.js'

function createMockSchema(types: {name: string; type: string}[] = []): Schema {
  return {
    _original: {types},
  } as unknown as Schema
}

function createWorkspace(
  overrides: Partial<Workspace> & {sources?: Partial<Workspace['unstable_sources'][number]>[]}= {},
): Workspace {
  const {sources, ...rest} = overrides
  const defaultSource = {
    dataset: 'production',
    name: 'default',
    projectId: 'proj1',
    schema: createMockSchema([{name: 'post', type: 'document'}]),
  }

  return {
    dataset: 'production',
    name: 'default',
    projectId: 'proj1',
    schema: createMockSchema(),
    unstable_sources: sources
      ? sources.map((s) => ({...defaultSource, ...s}))
      : [defaultSource],
    ...rest,
  }
}

describe('resolveGraphQLApis', () => {
  describe('single workspace, no config', () => {
    test('returns API from the single source', () => {
      const workspace = createWorkspace()
      const result = resolveGraphQLApis({workspaces: [workspace]})

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        dataset: 'production',
        projectId: 'proj1',
      })
      expect(result[0].schemaTypes).toEqual([{name: 'post', type: 'document'}])
    })
  })

  describe('error cases', () => {
    test('throws when no workspaces are provided', () => {
      expect(() => resolveGraphQLApis({workspaces: []})).toThrow(
        'No studio configuration found',
      )
    })

    test('throws when workspace has no sources', () => {
      const workspace = createWorkspace({sources: []})
      // No sources means unstable_sources is empty
      workspace.unstable_sources = []

      expect(() => resolveGraphQLApis({workspaces: [workspace]})).toThrow(
        'No sources (project ID / dataset) configured',
      )
    })

    test('throws when multiple workspaces without graphql config', () => {
      const ws1 = createWorkspace({name: 'ws1'})
      const ws2 = createWorkspace({name: 'ws2'})

      expect(() => resolveGraphQLApis({workspaces: [ws1, ws2]})).toThrow(
        'Multiple workspaces/sources configured',
      )
    })

    test('throws when multiple sources in single workspace without graphql config', () => {
      const workspace = createWorkspace({
        sources: [
          {dataset: 'prod', name: 'source1'},
          {dataset: 'staging', name: 'source2'},
        ],
      })

      expect(() => resolveGraphQLApis({workspaces: [workspace]})).toThrow(
        'Multiple workspaces/sources configured',
      )
    })
  })

  describe('with graphql config', () => {
    test('resolves API from explicit workspace and source', () => {
      const workspace = createWorkspace({
        name: 'studio',
        sources: [{dataset: 'production', name: 'main', projectId: 'p1'}],
      })

      const result = resolveGraphQLApis({
        cliConfig: {graphql: [{source: 'main', tag: 'v1', workspace: 'studio'}]},
        workspaces: [workspace],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        dataset: 'production',
        projectId: 'p1',
        tag: 'v1',
      })
    })

    test('infers single workspace when workspace name not specified', () => {
      const workspace = createWorkspace({name: 'my-studio'})

      const result = resolveGraphQLApis({
        cliConfig: {graphql: [{tag: 'default'}]},
        workspaces: [workspace],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'production', projectId: 'proj1'})
    })

    test('infers single source when source name not specified', () => {
      const workspace = createWorkspace({name: 'default'})

      const result = resolveGraphQLApis({
        cliConfig: {graphql: [{workspace: 'default'}]},
        workspaces: [workspace],
      })

      expect(result).toHaveLength(1)
    })

    test('throws when workspace name required but not specified', () => {
      const ws1 = createWorkspace({name: 'ws1'})
      const ws2 = createWorkspace({name: 'ws2'})

      expect(() =>
        resolveGraphQLApis({
          cliConfig: {graphql: [{tag: 'default'}]},
          workspaces: [ws1, ws2],
        }),
      ).toThrow('Must define `workspace` name')
    })

    test('throws when workspace not found', () => {
      const workspace = createWorkspace({name: 'studio'})

      expect(() =>
        resolveGraphQLApis({
          cliConfig: {graphql: [{workspace: 'nonexistent'}]},
          workspaces: [workspace],
        }),
      ).toThrow('Workspace "nonexistent" not found')
    })

    test('throws when source not found', () => {
      const workspace = createWorkspace({
        name: 'studio',
        sources: [{name: 'main'}],
      })

      expect(() =>
        resolveGraphQLApis({
          cliConfig: {graphql: [{source: 'nonexistent', workspace: 'studio'}]},
          workspaces: [workspace],
        }),
      ).toThrow('Source "nonexistent" not found in workspace "studio"')
    })

    test('resolves multiple APIs from config', () => {
      const workspace = createWorkspace({
        name: 'default',
        sources: [
          {dataset: 'production', name: 'prod', projectId: 'p1'},
          {dataset: 'staging', name: 'staging', projectId: 'p1'},
        ],
      })

      const result = resolveGraphQLApis({
        cliConfig: {
          graphql: [
            {source: 'prod', tag: 'default', workspace: 'default'},
            {source: 'staging', tag: 'staging', workspace: 'default'},
          ],
        },
        workspaces: [workspace],
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({dataset: 'production', tag: 'default'})
      expect(result[1]).toMatchObject({dataset: 'staging', tag: 'staging'})
    })

    test('throws when graphql config is empty array', () => {
      const workspace = createWorkspace()

      expect(() =>
        resolveGraphQLApis({
          cliConfig: {graphql: []},
          workspaces: [workspace],
        }),
      ).toThrow('No GraphQL APIs defined')
    })
  })

  describe('schema stripping', () => {
    test('strips non-serializable values from schema types', () => {
      const schema = createMockSchema([
        {
          // Nested plain objects should be preserved
          fields: [{name: 'title', type: 'string'}],
          name: 'post',
          type: 'document',
          // Functions should be stripped
          validation: () => true,
        } as unknown as {name: string; type: string},
      ])

      const workspace = createWorkspace({
        sources: [{schema}],
      })

      const result = resolveGraphQLApis({workspaces: [workspace]})
      const schemaType = result[0].schemaTypes[0]

      expect(schemaType.name).toBe('post')
      expect(schemaType.type).toBe('document')
      expect(schemaType.fields).toEqual([{name: 'title', type: 'string'}])
      // validation function should be stripped
      expect((schemaType as unknown as Record<string, unknown>).validation).toBeUndefined()
    })

    test('handles schema with no _original', () => {
      const schema = {} as unknown as Schema
      const workspace = createWorkspace({
        sources: [{schema}],
      })

      const result = resolveGraphQLApis({workspaces: [workspace]})
      expect(result[0].schemaTypes).toEqual([])
    })
  })
})
