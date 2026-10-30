import {Args} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context} from '@sanity/client'

import {getMcpEndpoint} from '../../services/context.js'
import {getOrganizationFlag} from '../../util/sharedFlags.js'
import {formatKeyValue} from '../debug/output.js'

type McpSource = Context.McpEndpoint['sources'][number]
type DatasetSource = Extract<McpSource, {type: 'dataset'}>
type McpSourceInput = Context.CreateMcpEndpointParams['sources'][number]
export type DatasetSettings = Partial<
  Pick<DatasetSource, 'perspective' | 'semanticSearch' | 'workspace'>
>

/**
 * The `<name>` argument of commands that act on an existing endpoint
 */
export const mcpEndpointNameArg = Args.string({
  description: 'MCP endpoint name, as in its URL',
  parse: parseEndpointName,
  required: true,
})

/**
 * An argument `parse` that trims an endpoint name and rejects an empty one
 */
export async function parseEndpointName(input: string): Promise<string> {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('The MCP endpoint name cannot be empty')
  return trimmed
}

/**
 * Get an endpoint by name or ID, failing the command when the lookup fails or finds nothing
 */
export async function findMcpEndpoint(
  organizationId: string,
  nameOrId: string,
): Promise<Context.McpEndpoint> {
  let endpoint
  try {
    endpoint = await getMcpEndpoint(organizationId, nameOrId)
  } catch (error) {
    throw new CLIError(`Failed to get MCP endpoint: ${getErrorMessage(error)}`, {
      exit: exitCodes.RUNTIME_ERROR,
    })
  }
  if (!endpoint) {
    throw new CLIError(`MCP endpoint "${nameOrId}" not found`, {exit: exitCodes.RUNTIME_ERROR})
  }
  return endpoint
}

/**
 * The `--organization` flag of commands that act on an existing endpoint
 */
export const mcpEndpointOrganizationFlag = getOrganizationFlag({
  description: 'Organization the MCP endpoint belongs to',
  semantics: 'override',
})

/**
 * A flag `parse` that trims the value and rejects an empty one
 */
export function parseNonEmpty(flag: string): (input: string) => Promise<string> {
  return async (input) => {
    const trimmed = input.trim()
    if (trimmed === '') {
      throw new Error(`\`--${flag}\` cannot be empty if provided`)
    }
    return trimmed
  }
}

/**
 * The API names a dataset source `<projectId>.<datasetName>`; the project comes from
 * `--project` or the CLI configuration.
 */
export function datasetSourceId(
  dataset: string | undefined,
  projectId: string | undefined,
): string | undefined {
  if (dataset === undefined) return undefined
  if (!projectId) {
    throw new CLIError(
      'Pass `--project` with `--dataset`, or run the command in a Sanity project directory.',
      {exit: exitCodes.USAGE_ERROR},
    )
  }
  return `${projectId}.${dataset}`
}

/**
 * Apply source changes to an endpoint's current sources, or to none when creating one. The dataset
 * keeps its settings until it is switched for another one; `dataset: null`
 * removes it. Sources are rebuilt from their known fields, since the stored
 * configuration may carry more. `notes` names the changes that were already in
 * place, which leave the sources as they were.
 */
export function editSources(
  current: McpSource[],
  changes: {
    addKnowledgeBases: string[]
    dataset: string | null | undefined
    removeKnowledgeBases: string[]
    settings: DatasetSettings
  },
): {notes: string[]; sources: McpSourceInput[]} {
  const notes: string[] = []
  const knowledgeBaseIds = current
    .filter((source) => source.type === 'knowledge-base')
    .map((source) => source.id)

  for (const id of new Set(changes.addKnowledgeBases)) {
    if (knowledgeBaseIds.includes(id)) {
      notes.push(`Knowledge base "${id}" is already a source`)
    } else {
      knowledgeBaseIds.push(id)
    }
  }
  for (const id of new Set(changes.removeKnowledgeBases)) {
    if (!knowledgeBaseIds.includes(id)) notes.push(`Knowledge base "${id}" is not a source`)
  }
  const sources: McpSourceInput[] = knowledgeBaseIds
    .filter((id) => !changes.removeKnowledgeBases.includes(id))
    .map((id) => ({id, type: 'knowledge-base'}))

  const dataset = findDatasetSource(current)
  if (changes.dataset === null && !dataset) notes.push('The endpoint has no dataset')
  const datasetId = changes.dataset === undefined ? dataset?.id : changes.dataset
  if (datasetId) {
    const kept =
      dataset?.id === datasetId
        ? {
            perspective: dataset.perspective,
            semanticSearch: dataset.semanticSearch,
            workspace: dataset.workspace,
          }
        : {}
    sources.push({id: datasetId, type: 'dataset', ...kept, ...changes.settings})
  }

  return {notes, sources}
}

function findDatasetSource(sources: McpSource[]): DatasetSource | undefined {
  return sources.find((source): source is DatasetSource => source.type === 'dataset')
}

/**
 * Key-value lines describing an endpoint, for `get`, `create` and `update` output
 */
export function formatMcpEndpoint(endpoint: Context.McpEndpoint): string[] {
  const padTo = 15 // "Knowledge bases" and "Semantic search" are the longest keys
  const knowledgeBaseIds = endpoint.sources
    .filter((source) => source.type === 'knowledge-base')
    .map((source) => source.id)
  const dataset = findDatasetSource(endpoint.sources)

  const lines = [
    formatKeyValue('ID', endpoint.id, {padTo}),
    formatKeyValue('Name', endpoint.name, {padTo}),
    formatKeyValue('Title', endpoint.title, {padTo}),
    formatKeyValue('URL', endpoint.url, {padTo}),
    formatKeyValue('Knowledge bases', knowledgeBaseIds.join(', ') || '-', {padTo}),
    formatKeyValue('Dataset', dataset?.id ?? '-', {padTo}),
  ]
  if (dataset) {
    lines.push(
      formatKeyValue('Workspace', dataset.workspace ?? '-', {padTo}),
      formatKeyValue('Perspective', dataset.perspective ?? '-', {padTo}),
      formatKeyValue('Semantic search', formatSemanticSearch(dataset.semanticSearch), {padTo}),
    )
  }
  lines.push(
    formatKeyValue('Instructions', endpoint.instructions ?? '-', {padTo}),
    formatKeyValue('GROQ filter', endpoint.groqFilter ?? '-', {padTo}),
  )
  return lines
}

function formatSemanticSearch(semanticSearch: boolean | null | undefined): string {
  if (semanticSearch === true) return 'on'
  if (semanticSearch === false) return 'off'
  return '-'
}
