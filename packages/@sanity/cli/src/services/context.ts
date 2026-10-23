import {getGlobalCliClient} from '@sanity/cli-core'
import {type Context} from '@sanity/client'

const CONTEXT_API_VERSION = 'v2026-08-25'

/**
 * Knowledge-base-scoped methods on `client.context` operate on the client's
 * configured `resource`; collection-level methods
 * (`client.context.knowledgeBases.*`) are addressed per call and need none.
 * GROQ-backed reads also need `context.organizationId`.
 */
async function getContextClient(knowledgeBaseId?: string, organizationId?: string) {
  return getGlobalCliClient({
    apiVersion: CONTEXT_API_VERSION,
    requireUser: true,
    ...(knowledgeBaseId === undefined
      ? {}
      : {resource: {id: knowledgeBaseId, type: 'knowledge-base' as const}}),
    ...(organizationId === undefined ? {} : {context: {organizationId}}),
  })
}

/**
 * GROQ-backed reads (issues, entries) query the organization's
 * document store, where documents are keyed by the knowledge base's public ID.
 * Fetching the knowledge base resolves both, whichever of its IDs was passed.
 */
async function getContextStoreClient(knowledgeBaseId: string) {
  const {organizationId, publicId} = await getKnowledgeBase(knowledgeBaseId)
  return getContextClient(publicId, organizationId)
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

/**
 * Start a build of a knowledge base
 */
export async function buildKnowledgeBase(knowledgeBaseId: string): Promise<Context.JobAccepted> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.build()
}

/**
 * Cancel the running build of a knowledge base, if any
 */
export async function cancelKnowledgeBaseBuild(
  knowledgeBaseId: string,
): Promise<{cancelled: boolean}> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.cancelBuild()
}

/**
 * Run an incremental refresh: re-check sources and apply what changed
 */
export async function refreshKnowledgeBase(
  knowledgeBaseId: string,
): Promise<{jobId: string; started: boolean}> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.refresh()
}

/**
 * Get an async job (build, import) by ID
 */
export async function getJob(knowledgeBaseId: string, jobId: string): Promise<Context.Job> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.jobs.get({jobId})
}

/**
 * List all issues for a knowledge base, optionally narrowed to one status
 */
export async function listIssues(
  knowledgeBaseId: string,
  status?: Context.IssueDoc['status'],
): Promise<Context.IssueDoc[]> {
  const client = await getContextStoreClient(knowledgeBaseId)
  return client.context.issues.list({status})
}

/**
 * Get a single issue by ID, or `null` when it does not exist
 */
export async function getIssue(
  knowledgeBaseId: string,
  issueId: string,
): Promise<Context.IssueDoc | null> {
  const client = await getContextStoreClient(knowledgeBaseId)
  return client.context.issues.get({issueId})
}

/**
 * Resolve a conflict issue by choosing one of its sides (by index). Choosing
 * a side other than the entry's current content starts a rewrite job.
 */
export async function resolveIssue(
  knowledgeBaseId: string,
  issueId: string,
  resolution: number,
): Promise<Context.ResolveIssueResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.issues.resolve({issueId, resolution})
}

/**
 * Dismiss an issue
 */
export async function dismissIssue(
  knowledgeBaseId: string,
  issueId: string,
): Promise<Context.DismissIssueResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.issues.dismiss({issueId})
}

/**
 * Reopen a resolved conflict issue
 */
export async function reopenIssue(
  knowledgeBaseId: string,
  issueId: string,
): Promise<Context.ReopenIssueResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.issues.reopen({issueId})
}

/**
 * Apply accepted issues to a knowledge base in one batch
 */
export async function applyIssues(
  knowledgeBaseId: string,
  issueIds: string[],
): Promise<Context.ApplyIssuesResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.issues.apply({issueIds})
}

/**
 * List all entries for a knowledge base, path-ordered, without bodies
 */
export async function listEntries(knowledgeBaseId: string): Promise<Context.Entry[]> {
  const client = await getContextStoreClient(knowledgeBaseId)
  return client.context.entries.list()
}

/**
 * Get a single entry with its body and citations by outline path, or `null`
 * when no entry sits at that path
 */
export async function getEntry(
  knowledgeBaseId: string,
  path: string,
): Promise<Context.EntryDoc | null> {
  const client = await getContextStoreClient(knowledgeBaseId)
  return client.context.entries.get({path})
}

/**
 * Rebuild one entry from its sources by outline path
 */
export async function rebuildEntry(
  knowledgeBaseId: string,
  path: string,
): Promise<Context.RebuildEntryResponse> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.entries.rebuild({path})
}

/**
 * Run a GROQ query against an organization's Context documents
 */
export async function queryContext(
  organizationId: string,
  query: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const client = await getContextClient(undefined, organizationId)
  return client.context.fetch(query, params)
}
