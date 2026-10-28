import {type Context} from '@sanity/client'

export const mcpDoc: Context.McpDoc = {
  _createdAt: '2026-10-01T00:00:00Z',
  _id: 'mcp.mcpabc123',
  _rev: 'rev-1',
  _type: 'sanity.context.mcp',
  _updatedAt: '2026-10-02T00:00:00Z',
  groqFilter: '_type == "product"',
  instructions: 'Answer support questions.',
  name: 'support',
  organizationId: 'org-abc123',
  publicId: 'mcpabc123',
  schemaVersion: 1,
  sources: [
    {id: 'kb-abc123', type: 'knowledge-base'},
    {
      id: 'proj1.production',
      perspective: 'drafts',
      semanticSearch: false,
      type: 'dataset',
      workspace: 'default',
    },
  ],
  title: 'Support',
}

export const mcpEndpoint: Context.McpEndpoint = {
  createdAt: '2026-10-01T00:00:00Z',
  groqFilter: mcpDoc.groqFilter,
  id: mcpDoc.publicId,
  instructions: mcpDoc.instructions,
  name: mcpDoc.name,
  organizationId: mcpDoc.organizationId,
  sources: mcpDoc.sources,
  title: mcpDoc.title,
  updatedAt: '2026-10-02T00:00:00Z',
  url: 'https://api.sanity.io/v2026-11-10/context/organizations/org-abc123/mcp/support',
}

export function withConfig({apiVersion}: {apiVersion: string}) {
  return {getUrl: (uri: string) => `https://api.sanity.io/${apiVersion}${uri}`}
}
