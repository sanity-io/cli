import {getGlobalCliClient, subdebug} from '@sanity/cli-core'
import {type Context, EXPERIMENTAL_API_WARNING, isHttpError} from '@sanity/client'

const CONTEXT_API_VERSION = 'v2026-08-25'
const BLUEPRINTS_API_VERSION = 'vX'
const BLUEPRINTS_LOOKUP_TIMEOUT_MS = 5000
// The version in the URLs the Context API returns for agents to connect to MCP endpoints
const MCP_CONNECT_API_VERSION = 'v2026-11-10'

const blueprintOwnershipDebug = subdebug('context:blueprint-ownership')

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
    const page = await client.context.knowledgeBases.list({
      cursor,
      organizationId,
    })
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
 * `stackName` is `null` when the caller can't read Blueprints: the search then
 * only says whether a blueprint manages the resource.
 */
export type BlueprintOwnership = {managed: false} | {managed: true; stackName: string | null}

/**
 * Who manages a resource, for refusal messages: the stack by name when the caller can read it
 */
export function describeBlueprintManager(stackName: string | null): string {
  return stackName ? `The blueprint stack "${stackName}"` : 'A blueprint'
}

/**
 * Whether a live blueprint stack manages the knowledge base
 */
export function getKnowledgeBaseBlueprintOwnership(
  knowledgeBaseId: string,
): Promise<BlueprintOwnership> {
  return getBlueprintOwnership('sanity.context.knowledge-base', async () => {
    const {organizationId, publicId} = await getKnowledgeBase(knowledgeBaseId)
    return {organizationId, publicId}
  })
}

/**
 * Whether a live blueprint stack manages the MCP endpoint
 */
export function getMcpEndpointBlueprintOwnership(
  organizationId: string,
  {publicId}: Pick<Context.McpDoc, 'publicId'>,
): Promise<BlueprintOwnership> {
  return getBlueprintOwnership('sanity.context.mcp', async () => ({organizationId, publicId}))
}

/**
 * Looks the resource up in the Blueprints resource search. Fails open: a
 * failed lookup answers not managed, so a Blueprints outage never blocks a
 * command. A resource that doesn't exist isn't managed either.
 */
async function getBlueprintOwnership(
  type: string,
  resolveResource: () => Promise<{organizationId: string; publicId: string} | null>,
): Promise<BlueprintOwnership> {
  try {
    const resource = await resolveResource()
    if (!resource) return {managed: false}
    const {organizationId, publicId} = resource
    const client = await getGlobalCliClient({
      apiVersion: BLUEPRINTS_API_VERSION,
      // The Blueprints API has no stable version yet, and the warning would interrupt command output.
      // The client splits the warning header on commas, so its second clause is matched separately.
      ignoreWarnings: [EXPERIMENTAL_API_WARNING, 'which will change without warning'],
      // The lookup fails open, so an unreachable Blueprints API must not hold the command for the client's defaults.
      maxRetries: 0,
      requireUser: true,
      timeout: BLUEPRINTS_LOOKUP_TIMEOUT_MS,
    })
    const headers = {
      'x-sanity-scope-id': organizationId,
      'x-sanity-scope-type': 'organization',
    }
    const matches = await client.request<{stackId?: string}[]>({
      headers,
      query: {id: publicId, type},
      url: '/blueprints/resources/search',
    })
    const stackId = matches.find((match) => typeof match.stackId === 'string')?.stackId
    if (!stackId) return {managed: false}
    const stackName = await client
      .request<{name?: string}>({
        headers,
        url: `/blueprints/stacks/${encodeURIComponent(stackId)}`,
      })
      .then((stack) => stack.name ?? null)
      .catch(() => null)
    return {managed: true, stackName}
  } catch (error) {
    if (isHttpError(error)) {
      if (error.statusCode === 403 && errorCode(error) === 'RESOURCE_MANAGED') {
        return {managed: true, stackName: null}
      }
      if (error.statusCode === 404 && errorCode(error) === 'RESOURCE_NOT_MANAGED') {
        return {managed: false}
      }
    }
    blueprintOwnershipDebug('Blueprint ownership lookup failed, treating as not managed', error)
    return {managed: false}
  }
}

function errorCode(error: {response: {body: unknown}}): unknown {
  const {body} = error.response
  return body && typeof body === 'object' && 'errorCode' in body ? body.errorCode : undefined
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

/**
 * An MCP endpoint's stored configuration, with the URL agents connect to
 */
export type McpEndpointConfig = Context.McpDoc & {url: string}

/**
 * List an organization's MCP endpoints, oldest first
 */
export async function listMcpEndpoints(organizationId: string): Promise<McpEndpointConfig[]> {
  const client = await getContextClient(undefined, organizationId)
  const endpoints = await client.context.mcpEndpoints.list()
  const connectClient = client.withConfig({apiVersion: MCP_CONNECT_API_VERSION})
  return endpoints.map((endpoint) => ({...endpoint, url: mcpEndpointUrl(connectClient, endpoint)}))
}

/**
 * Get an MCP endpoint by name or ID, or `null` when the organization has none.
 * Update and delete accept either, so the lookups guarding them must too.
 */
export async function getMcpEndpoint(
  organizationId: string,
  nameOrId: string,
): Promise<McpEndpointConfig | null> {
  const client = await getContextClient(undefined, organizationId)
  const endpoint = await client.context.fetch<Context.McpDoc | null>(
    '*[_type == "sanity.context.mcp" && organizationId == $org && (name == $nameOrId || publicId == $nameOrId)][0]',
    {nameOrId, org: organizationId},
  )
  const connectClient = client.withConfig({apiVersion: MCP_CONNECT_API_VERSION})
  return endpoint && {...endpoint, url: mcpEndpointUrl(connectClient, endpoint)}
}

/**
 * The stored configuration doesn't carry the URL that create and edit return,
 * so it is built from the same route and API version.
 */
function mcpEndpointUrl(
  connectClient: {getUrl: (uri: string) => string},
  {name, organizationId}: Context.McpDoc,
): string {
  return connectClient.getUrl(
    `/context/organizations/${encodeURIComponent(organizationId)}/mcp/${encodeURIComponent(name)}`,
  )
}

/**
 * Create an MCP endpoint
 */
export async function createMcpEndpoint(
  organizationId: string,
  params: Context.CreateMcpEndpointParams,
): Promise<Context.McpEndpoint> {
  const client = await getContextClient(undefined, organizationId)
  return client.context.mcpEndpoints.create(params)
}

/**
 * Update an MCP endpoint's configuration
 */
export async function updateMcpEndpoint(
  organizationId: string,
  name: string,
  params: Context.EditMcpEndpointParams,
): Promise<Context.McpEndpoint> {
  const client = await getContextClient(undefined, organizationId)
  return client.context.mcpEndpoints.edit({...params, name})
}

/**
 * Delete an MCP endpoint
 */
export async function deleteMcpEndpoint(organizationId: string, name: string): Promise<void> {
  const client = await getContextClient(undefined, organizationId)
  await client.context.mcpEndpoints.delete({name})
}

/**
 * Check whether an agent connecting with the current credentials can use an MCP endpoint
 */
export async function getMcpEndpointStatus(
  organizationId: string,
  name: string,
): Promise<Context.McpEndpointStatus> {
  const client = await getContextClient(undefined, organizationId)
  return client.context.mcpEndpoints.status({name})
}
