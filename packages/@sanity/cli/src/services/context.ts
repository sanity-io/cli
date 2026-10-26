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
 * Drain a paginated Context list endpoint
 */
async function listAll<T>(
  fetchPage: (cursor: string | undefined) => Promise<{data: T[]; nextCursor: string | null}>,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor)
    items.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)

  return items
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

  return listAll((cursor) => client.context.knowledgeBases.list({cursor, organizationId}))
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
 * Add a source to a knowledge base. A `files` source with a `file` is created,
 * uploaded to signed storage and synced by the client, which resolves with the
 * source read again.
 */
export async function createSource(
  knowledgeBaseId: string,
  params: Context.CreateSourceParams,
): Promise<Context.Source> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.create(params)
}

/**
 * Estimate what a crawl of a website would fetch, without adding it as a source
 */
export async function previewWebSource(
  knowledgeBaseId: string,
  params: Context.PreviewWebSourceParams,
): Promise<Context.CrawlPreview> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.preview(params)
}

/**
 * List all sources of a knowledge base (drains pagination)
 */
export async function listSources(knowledgeBaseId: string): Promise<Context.Source[]> {
  const client = await getContextClient(knowledgeBaseId)
  return listAll((cursor) => client.context.sources.list({cursor}))
}

/**
 * Get a single source by ID
 */
export async function getSource(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<Context.Source> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.get({sourceId})
}

/**
 * Change a source's title, crawl options, dataset query or sync frequency
 */
export async function editSource(
  knowledgeBaseId: string,
  sourceId: string,
  params: Context.EditSourceParams,
): Promise<Context.Source> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.edit({sourceId, ...params})
}

/**
 * Remove a source and its documents from a knowledge base
 */
export async function deleteSource(knowledgeBaseId: string, sourceId: string): Promise<void> {
  const client = await getContextClient(knowledgeBaseId)
  await client.context.sources.delete({sourceId})
}

/**
 * Upload a file to a `files` source, replacing the file it holds, and sync it
 */
export async function uploadSourceFile(
  knowledgeBaseId: string,
  sourceId: string,
  upload: Context.SourceFileUpload,
): Promise<Context.SyncAccepted> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.upload({sourceId, ...upload})
}

/**
 * Sync one source: read its website or dataset again, or sync a `files`
 * source's current file
 */
export async function syncSource(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<Context.SyncAccepted> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.syncs.create({sourceId})
}

/**
 * List all syncs of a source, newest first (drains pagination)
 */
export async function listSyncs(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<Context.Sync[]> {
  const client = await getContextClient(knowledgeBaseId)
  return listAll((cursor) => client.context.sources.syncs.list({cursor, sourceId}))
}

/**
 * Get a single sync of a source by ID
 */
export async function getSync(
  knowledgeBaseId: string,
  sourceId: string,
  syncId: string,
): Promise<Context.Sync> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.syncs.get({sourceId, syncId})
}

/**
 * Confirm a held sync: delete the documents it didn't find, and complete it
 */
export async function confirmSync(
  knowledgeBaseId: string,
  sourceId: string,
  syncId: string,
): Promise<Context.Sync> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.syncs.confirm({sourceId, syncId})
}

/**
 * Discard a held sync: complete it without deleting anything
 */
export async function discardSync(
  knowledgeBaseId: string,
  sourceId: string,
  syncId: string,
): Promise<Context.Sync> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sources.syncs.discard({sourceId, syncId})
}

/**
 * Queue a sync of every website and dataset source of a knowledge base
 */
export async function syncKnowledgeBase(knowledgeBaseId: string): Promise<Context.SyncAllAccepted> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.sync()
}

/**
 * List all documents of a knowledge base, optionally only those of one source
 * or in one state (drains pagination)
 */
export async function listDocuments(
  knowledgeBaseId: string,
  filter: {source?: string; state?: Context.Document['state']},
): Promise<Context.Document[]> {
  const client = await getContextClient(knowledgeBaseId)
  return listAll((cursor) => client.context.documents.list({cursor, ...filter}))
}

/**
 * Get a single document with the chunks of its markdown
 */
export async function getDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<Context.DocumentDetail> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.documents.get({documentId})
}

/**
 * Get a document's content as text (`markdown`, `plain`), as the JSON view with
 * line numbers (`json`), or as the bytes its source gave (`raw`)
 */
export async function getDocumentContent<F extends 'json' | 'markdown' | 'plain' | 'raw'>(
  knowledgeBaseId: string,
  documentId: string,
  options: {chunk?: string; format: F; lines?: string},
): Promise<Context.DocumentContent<F>> {
  const client = await getContextClient(knowledgeBaseId)
  return client.context.documents.content({documentId, ...options})
}

/**
 * Delete a document from its source
 */
export async function deleteDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
  const client = await getContextClient(knowledgeBaseId)
  await client.context.documents.delete({documentId})
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
 * Get an async job (build, update, `files` sync) by ID
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
