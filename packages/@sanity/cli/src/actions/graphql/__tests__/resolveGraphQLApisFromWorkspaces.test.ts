import {type Schema} from '@sanity/types'
import {describe, expect, test} from 'vitest'

import {
  resolveGraphQLApiMetadata,
  resolveGraphQLApis,
  type SourceMetadata,
  type Workspace,
  type WorkspaceMetadata,
} from '../resolveGraphQLApisFromWorkspaces.js'

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

    test('uses apiDef dataset/projectId overrides over source values', () => {
      const workspace = createWorkspace({
        name: 'default',
        sources: [{dataset: 'source-ds', name: 'default', projectId: 'source-proj'}],
      })

      const result = resolveGraphQLApis({
        cliConfig: {graphql: [{dataset: 'override-ds', projectId: 'override-proj'}]},
        workspaces: [workspace],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'override-ds', projectId: 'override-proj'})
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

function createWorkspaceMetadata(
  overrides: Omit<Partial<WorkspaceMetadata>, 'sources'> & {sources?: SourceMetadata[]} = {},
): WorkspaceMetadata {
  const {sources, ...rest} = overrides
  const defaults = {
    dataset: 'production',
    name: 'default',
    projectId: 'proj1',
  }

  const merged = {...defaults, ...rest}
  const defaultSource = {dataset: merged.dataset, name: merged.name, projectId: merged.projectId}

  return {
    ...merged,
    sources: sources
      ? sources.map((s) => ({...defaultSource, ...s}))
      : [defaultSource],
  }
}

describe('resolveGraphQLApiMetadata', () => {
  describe('single workspace, no config', () => {
    test('returns metadata from the single workspace', () => {
      const ws = createWorkspaceMetadata()
      const result = resolveGraphQLApiMetadata({workspaces: [ws]})

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'production', projectId: 'proj1'})
    })

    test('does not include extracted or schemaErrors', () => {
      const ws = createWorkspaceMetadata()
      const result = resolveGraphQLApiMetadata({workspaces: [ws]})

      expect(result[0].extracted).toBeUndefined()
      expect(result[0].schemaErrors).toBeUndefined()
      expect(result[0].extractionError).toBeUndefined()
    })
  })

  describe('error cases', () => {
    test('throws when no workspaces are provided', () => {
      expect(() => resolveGraphQLApiMetadata({workspaces: []})).toThrow(
        'No studio configuration found',
      )
    })

    test('throws when workspace has empty projectId', () => {
      const ws = createWorkspaceMetadata({projectId: ''})

      expect(() => resolveGraphQLApiMetadata({workspaces: [ws]})).toThrow(
        'missing a projectId or dataset',
      )
    })

    test('throws when workspace has empty dataset', () => {
      const ws = createWorkspaceMetadata({dataset: ''})

      expect(() => resolveGraphQLApiMetadata({workspaces: [ws]})).toThrow(
        'missing a projectId or dataset',
      )
    })

    test('throws when multiple workspaces without graphql config', () => {
      const ws1 = createWorkspaceMetadata({name: 'ws1'})
      const ws2 = createWorkspaceMetadata({name: 'ws2'})

      expect(() => resolveGraphQLApiMetadata({workspaces: [ws1, ws2]})).toThrow(
        'Multiple workspaces/sources configured',
      )
    })

    test('throws when multiple sources in single workspace without graphql config', () => {
      const ws = createWorkspaceMetadata({
        sources: [
          {dataset: 'prod', name: 'source1', projectId: 'proj1'},
          {dataset: 'staging', name: 'source2', projectId: 'proj1'},
        ],
      })

      expect(() => resolveGraphQLApiMetadata({workspaces: [ws]})).toThrow(
        'Multiple workspaces/sources configured',
      )
    })

    test('throws when workspace has no sources', () => {
      const ws = createWorkspaceMetadata({sources: []})
      // Override sources to empty
      ws.sources = []

      expect(() => resolveGraphQLApiMetadata({workspaces: [ws]})).toThrow(
        'No sources (project ID / dataset) configured',
      )
    })
  })

  describe('with graphql config', () => {
    test('resolves metadata from explicit workspace', () => {
      const ws = createWorkspaceMetadata({dataset: 'staging', name: 'studio', projectId: 'p1'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{id: 'my-api', tag: 'v1', workspace: 'studio'}]},
        workspaces: [ws],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        dataset: 'staging',
        id: 'my-api',
        projectId: 'p1',
        tag: 'v1',
      })
    })

    test('infers single workspace when workspace name not specified', () => {
      const ws = createWorkspaceMetadata({name: 'my-studio'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{tag: 'default'}]},
        workspaces: [ws],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'production', projectId: 'proj1'})
    })

    test('uses apiDef dataset/projectId when specified', () => {
      const ws = createWorkspaceMetadata({dataset: 'production', projectId: 'proj1'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{dataset: 'override-ds', projectId: 'override-proj'}]},
        workspaces: [ws],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'override-ds', projectId: 'override-proj'})
    })

    test('falls back to workspace dataset/projectId when apiDef omits them', () => {
      const ws = createWorkspaceMetadata({dataset: 'ws-dataset', projectId: 'ws-proj'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{tag: 'default'}]},
        workspaces: [ws],
      })

      expect(result[0]).toMatchObject({dataset: 'ws-dataset', projectId: 'ws-proj'})
    })

    test('preserves all optional fields from apiDef', () => {
      const ws = createWorkspaceMetadata()

      const result = resolveGraphQLApiMetadata({
        cliConfig: {
          graphql: [
            {
              filterSuffix: 'Filter',
              generation: 'gen3',
              id: 'test-api',
              nonNullDocumentFields: true,
              playground: false,
              tag: 'staging',
            },
          ],
        },
        workspaces: [ws],
      })

      expect(result[0]).toMatchObject({
        filterSuffix: 'Filter',
        generation: 'gen3',
        id: 'test-api',
        nonNullDocumentFields: true,
        playground: false,
        tag: 'staging',
      })
    })

    test('resolves multiple APIs from config', () => {
      const ws1 = createWorkspaceMetadata({dataset: 'prod', name: 'prod', projectId: 'p1'})
      const ws2 = createWorkspaceMetadata({dataset: 'staging', name: 'staging', projectId: 'p1'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {
          graphql: [
            {id: 'prod-api', tag: 'default', workspace: 'prod'},
            {id: 'staging-api', tag: 'staging', workspace: 'staging'},
          ],
        },
        workspaces: [ws1, ws2],
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({dataset: 'prod', id: 'prod-api', tag: 'default'})
      expect(result[1]).toMatchObject({dataset: 'staging', id: 'staging-api', tag: 'staging'})
    })

    test('throws when workspace name required but not specified', () => {
      const ws1 = createWorkspaceMetadata({name: 'ws1'})
      const ws2 = createWorkspaceMetadata({name: 'ws2'})

      expect(() =>
        resolveGraphQLApiMetadata({
          cliConfig: {graphql: [{tag: 'default'}]},
          workspaces: [ws1, ws2],
        }),
      ).toThrow('Must define `workspace` name')
    })

    test('throws when workspace not found', () => {
      const ws = createWorkspaceMetadata({name: 'studio'})

      expect(() =>
        resolveGraphQLApiMetadata({
          cliConfig: {graphql: [{workspace: 'nonexistent'}]},
          workspaces: [ws],
        }),
      ).toThrow('Workspace "nonexistent" not found')
    })

    test('defaults workspace lookup to "default" when name not specified', () => {
      const ws1 = createWorkspaceMetadata({name: 'default', projectId: 'default-proj'})
      const ws2 = createWorkspaceMetadata({name: 'other', projectId: 'other-proj'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{workspace: 'default'}]},
        workspaces: [ws1, ws2],
      })

      expect(result[0]).toMatchObject({projectId: 'default-proj'})
    })

    test('throws when graphql config is empty array', () => {
      const ws = createWorkspaceMetadata()

      expect(() =>
        resolveGraphQLApiMetadata({
          cliConfig: {graphql: []},
          workspaces: [ws],
        }),
      ).toThrow('No GraphQL APIs defined')
    })

    test('resolves metadata from explicit source', () => {
      const ws = createWorkspaceMetadata({
        name: 'studio',
        sources: [
          {dataset: 'production', name: 'main', projectId: 'p1'},
          {dataset: 'staging', name: 'staging', projectId: 'p2'},
        ],
      })

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{source: 'staging', tag: 'v1', workspace: 'studio'}]},
        workspaces: [ws],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        dataset: 'staging',
        projectId: 'p2',
        tag: 'v1',
      })
    })

    test('infers single source when source name not specified', () => {
      const ws = createWorkspaceMetadata({name: 'default'})

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{workspace: 'default'}]},
        workspaces: [ws],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({dataset: 'production', projectId: 'proj1'})
    })

    test('throws when source not found', () => {
      const ws = createWorkspaceMetadata({
        name: 'studio',
        sources: [{dataset: 'production', name: 'main', projectId: 'proj1'}],
      })

      expect(() =>
        resolveGraphQLApiMetadata({
          cliConfig: {graphql: [{source: 'nonexistent', workspace: 'studio'}]},
          workspaces: [ws],
        }),
      ).toThrow('Source "nonexistent" not found in workspace "studio"')
    })

    test('resolves multiple APIs from multiple sources', () => {
      const ws = createWorkspaceMetadata({
        name: 'default',
        sources: [
          {dataset: 'production', name: 'prod', projectId: 'p1'},
          {dataset: 'staging', name: 'staging', projectId: 'p1'},
        ],
      })

      const result = resolveGraphQLApiMetadata({
        cliConfig: {
          graphql: [
            {source: 'prod', tag: 'default', workspace: 'default'},
            {source: 'staging', tag: 'staging', workspace: 'default'},
          ],
        },
        workspaces: [ws],
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({dataset: 'production', tag: 'default'})
      expect(result[1]).toMatchObject({dataset: 'staging', tag: 'staging'})
    })

    test('falls back to source dataset/projectId when apiDef omits them', () => {
      const ws = createWorkspaceMetadata({
        sources: [{dataset: 'source-ds', name: 'default', projectId: 'source-proj'}],
      })

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{tag: 'default'}]},
        workspaces: [ws],
      })

      expect(result[0]).toMatchObject({dataset: 'source-ds', projectId: 'source-proj'})
    })

    test('apiDef dataset/projectId overrides source values', () => {
      const ws = createWorkspaceMetadata({
        sources: [{dataset: 'source-ds', name: 'default', projectId: 'source-proj'}],
      })

      const result = resolveGraphQLApiMetadata({
        cliConfig: {graphql: [{dataset: 'override-ds', projectId: 'override-proj'}]},
        workspaces: [ws],
      })

      expect(result[0]).toMatchObject({dataset: 'override-ds', projectId: 'override-proj'})
    })
  })
})
