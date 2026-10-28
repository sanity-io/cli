import {type Context} from '@sanity/client'

import {formatKeyValue} from '../debug/output.js'

type McpSource = Context.McpDoc['sources'][number]
type DatasetSource = Extract<McpSource, {type: 'dataset'}>
type McpSourceInput = Context.CreateMcpEndpointParams['sources'][number]
export type DatasetSettings = Partial<
  Pick<DatasetSource, 'perspective' | 'semanticSearch' | 'workspace'>
>

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
 * Parse a `--dataset` value, which names the dataset as `<projectId>.<datasetName>`
 */
export async function parseDatasetSourceId(input: string): Promise<string> {
  const trimmed = input.trim()
  const [projectId, datasetName, ...rest] = trimmed.split('.')
  if (!projectId || !datasetName || rest.length > 0) {
    throw new Error('`--dataset` must be given as <projectId>.<datasetName>')
  }
  return trimmed
}

/**
 * Build an endpoint's sources from knowledge base IDs and an optional dataset
 */
export function buildSources(
  knowledgeBaseIds: string[],
  dataset: string | undefined,
  settings: DatasetSettings,
): McpSourceInput[] {
  const sources: McpSourceInput[] = knowledgeBaseIds.map((id) => ({id, type: 'knowledge-base'}))
  if (dataset !== undefined) sources.push({...settings, id: dataset, type: 'dataset'})
  return sources
}

/**
 * Apply an update's source changes to an endpoint's current sources. The dataset
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
export function formatMcpEndpoint(
  endpoint: Pick<Context.McpDoc, 'groqFilter' | 'instructions' | 'name' | 'sources' | 'title'> & {
    id: string
    url: string
  },
): string[] {
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
