import {getGlobalCliClient} from '@sanity/cli-core'
import {type Context} from '@sanity/client'

const CONTEXT_API_VERSION = 'v2026-08-25'

/**
 * Knowledge-base-scoped methods on `client.context` (imports, builds, jobs)
 * operate on the client's configured `resource`; collection-level methods
 * (`client.context.knowledgeBases.*`) are addressed per call and need none.
 */
async function getContextClient(knowledgeBaseId?: string) {
  return getGlobalCliClient({
    apiVersion: CONTEXT_API_VERSION,
    requireUser: true,
    ...(knowledgeBaseId === undefined
      ? {}
      : {resource: {id: knowledgeBaseId, type: 'knowledge-base' as const}}),
  })
}

/**
 * Create a knowledge base in an organization
 */
export async function createKnowledgeBase(
  params: Context.CreateKnowledgeBaseParams,
): Promise<Context.KnowledgeBase> {
  const client = await getContextClient()
  return client.context.knowledgeBases.create(params)
}

/**
 * List all knowledge bases in an organization (drains pagination)
 */
export async function listKnowledgeBases(organizationId: string): Promise<Context.KnowledgeBase[]> {
  const client = await getContextClient()

  const knowledgeBases: Context.KnowledgeBase[] = []
  let cursor: string | undefined
  do {
    const page = await client.context.knowledgeBases.list({cursor, organizationId})
    knowledgeBases.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)

  return knowledgeBases
}

/**
 * Get a single knowledge base by ID
 */
export async function getKnowledgeBase(knowledgeBaseId: string): Promise<Context.KnowledgeBase> {
  const client = await getContextClient()
  return client.context.knowledgeBases.get(knowledgeBaseId)
}

/**
 * Update a knowledge base's configuration
 */
export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  params: Context.EditKnowledgeBaseParams,
): Promise<Context.KnowledgeBase> {
  const client = await getContextClient()
  return client.context.knowledgeBases.edit(knowledgeBaseId, params)
}

/**
 * Delete a knowledge base and its generated content
 */
export async function deleteKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  const client = await getContextClient()
  await client.context.knowledgeBases.delete(knowledgeBaseId)
}

/**
 * Import content into a knowledge base. File imports are staged and uploaded
 * to signed storage by the client.
 */
export async function createImport(
  knowledgeBaseId: string,
  params: Context.CreateFileImportParams | Context.CreateImportParams,
): Promise<Context.JobAccepted> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.imports.create(params)
}

/**
 * List all imports for a knowledge base (drains pagination)
 */
export async function listImports(knowledgeBaseId: string): Promise<Context.Import[]> {
  const client = await getContextClient(knowledgeBaseId)

  const imports: Context.Import[] = []
  let cursor: string | undefined
  do {
    const page = await client.context.imports.list({cursor})
    imports.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)

  return imports
}

/**
 * Get a single import by ID
 */
export async function getImport(
  knowledgeBaseId: string,
  importId: string,
): Promise<Context.ImportDetail> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.imports.get({importId})
}

/**
 * Get a short-lived signed URL for an import's original uploaded bytes
 */
export async function downloadImport(
  knowledgeBaseId: string,
  importId: string,
): Promise<Context.ImportDownloadResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.imports.download({importId})
}

/**
 * Delete an import from a knowledge base
 */
export async function deleteImport(knowledgeBaseId: string, importId: string): Promise<void> {
  const client = await getContextClient(knowledgeBaseId)
  await client.context.imports.delete({importId})
}
