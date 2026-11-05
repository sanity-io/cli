import {getGlobalCliClient, subdebug} from '@sanity/cli-core'
import {type Context, EXPERIMENTAL_API_WARNING, isHttpError} from '@sanity/client'

const CONTEXT_API_VERSION = 'v2026-08-25'
const BLUEPRINTS_API_VERSION = 'vX'
const BLUEPRINTS_LOOKUP_TIMEOUT_MS = 5000
// The version in the URLs the Context API returns for agents to connect to MCP endpoints
const MCP_CONNECT_API_VERSION = 'v2026-11-03'
// Documents per page while a GROQ list read drains the store
const STORE_PAGE_SIZE = 200
const MCP_LIST_LIMIT = 500

const blueprintOwnershipDebug = subdebug('context:blueprint-ownership')

/** A knowledge base */
export type KnowledgeBase = Context.Response<'GET /knowledge-bases/{knowledgeBaseId}'>
/** An async job: a build, an update or a `files` sync */
export type Job = Context.Response<'GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}'>
/** One run of a source's connector */
export type Sync =
  Context.Response<'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}'>

/** The request a command builds: path parameters, query and body */
export interface ContextRequest {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
}

type Page = {data: unknown[]; nextCursor: string | null}

function isPage(value: unknown): value is Page {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    Array.isArray(value.data) &&
    'nextCursor' in value
  )
}

async function getContextClient(organizationId?: string) {
  return getGlobalCliClient({
    apiVersion: CONTEXT_API_VERSION,
    requireUser: true,
    ...(organizationId === undefined ? {} : {context: {organizationId}}),
  })
}

/**
 * Call a Context API operation by its route. Commands build requests at
 * runtime from the spec, so this is the one place the route-typed client call
 * is loosened to a runtime route and request.
 */
export async function requestContext(
  route: Context.Route,
  request: ContextRequest = {},
): Promise<unknown> {
  const client = await getContextClient()
  const call = client.context.request as (route: string, init: ContextRequest) => Promise<unknown>
  return call.call(client.context, route, request)
}

/** Call a paginated list operation and drain every page into one list */
export async function requestAllPages(
  route: Context.Route,
  request: ContextRequest = {},
): Promise<unknown[]> {
  const items: unknown[] = []
  let cursor: string | undefined
  do {
    const page = await requestContext(route, {
      ...request,
      query: {...request.query, ...(cursor && {cursor})},
    })
    if (!isPage(page)) return items
    items.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return items
}

/** A document's content as the bytes its source gave (`format: 'raw'`) */
export async function getDocumentBytes(request: ContextRequest): Promise<Uint8Array> {
  const client = await getContextClient()
  const call = client.context.requestBytes as (
    route: string,
    init: ContextRequest,
  ) => Promise<Uint8Array>
  return call.call(
    client.context,
    'GET /knowledge-bases/{knowledgeBaseId}/documents/{documentId}/content',
    request,
  )
}

/** Get a knowledge base */
async function getKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBase> {
  const client = await getContextClient()
  return client.context.request('GET /knowledge-bases/{knowledgeBaseId}', {
    params: {knowledgeBaseId},
  })
}

/** Get a source, with its latest sync */
export async function getSource(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<Context.Source> {
  const client = await getContextClient()
  return client.context.request('GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}', {
    params: {knowledgeBaseId, sourceId},
  })
}

/** Get a job by ID */
export async function getJob(knowledgeBaseId: string, jobId: string): Promise<Job> {
  const client = await getContextClient()
  return client.context.request('GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}', {
    params: {jobId, knowledgeBaseId},
  })
}

/** Add a `files` source holding a local file: add the source, upload the file and sync it */
export async function createFileSource(
  knowledgeBaseId: string,
  params: Omit<Context.CreateFileSourceParams, 'knowledgeBaseId'>,
): Promise<Context.Source> {
  const client = await getContextClient()
  return client.context.createFileSource({...params, knowledgeBaseId})
}

/** Upload a file to a `files` source, replacing the file it holds, and sync it */
export async function uploadSourceFile(
  knowledgeBaseId: string,
  sourceId: string,
  upload: Context.FileUpload,
): Promise<Context.SyncAccepted> {
  const client = await getContextClient()
  return client.context.uploadFile({...upload, knowledgeBaseId, sourceId})
}

/** Run a GROQ query against an organization's Context documents */
export async function queryContext(
  organizationId: string,
  query: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const client = await getContextClient(organizationId)
  return client.context.fetch(query, params)
}

/**
 * GROQ reads of a knowledge base's documents query the organization's document
 * store, where documents are keyed by the knowledge base's public ID. Fetching
 * the knowledge base resolves both, whichever of its IDs was passed.
 */
async function getStoreScope(knowledgeBaseId: string) {
  const {organizationId, publicId} = await getKnowledgeBase(knowledgeBaseId)
  return {client: await getContextClient(organizationId), kb: publicId}
}

/** Drain a `(_createdAt, _id)`-keyset GROQ read */
async function drainByCreatedAt<T extends {_createdAt: string; _id: string}>(
  organizationId: string,
  filter: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const client = await getContextClient(organizationId)
  const all: T[] = []
  let cursor: {c: string; i: string} | undefined
  for (;;) {
    const paged = cursor
      ? `${filter} && (_createdAt > $c || (_createdAt == $c && _id > $i))`
      : filter
    const page = await client.context.fetch<T[]>(
      `*[${paged}] | order(_createdAt asc, _id asc) [0...${STORE_PAGE_SIZE}]`,
      {...params, ...cursor},
    )
    all.push(...page)
    if (page.length < STORE_PAGE_SIZE) return all
    const last = page.at(-1)!
    cursor = {c: last._createdAt, i: last._id}
  }
}

/** The fields `entries list` shows of each entry */
export type EntrySummary = Pick<Context.EntryDoc, '_id' | 'path' | 'status' | 'title' | 'tldr'>

/** List all entries of a knowledge base, path-ordered, without bodies */
export async function listEntries(knowledgeBaseId: string): Promise<EntrySummary[]> {
  const {client, kb} = await getStoreScope(knowledgeBaseId)
  const all: EntrySummary[] = []
  let after = ''
  for (;;) {
    const page = await client.context.fetch<EntrySummary[]>(
      `*[_type == "sanity.context.entry" && knowledgeBaseId == $kb && path > $after] | order(path asc) [0...${STORE_PAGE_SIZE}] {_id, path, title, tldr, status}`,
      {after, kb},
    )
    all.push(...page)
    if (page.length < STORE_PAGE_SIZE) return all
    after = page.at(-1)!.path
  }
}

/** Get an entry with its body and citations by outline path, or `null` when no entry sits there */
export async function getEntry(
  knowledgeBaseId: string,
  path: string,
): Promise<Context.EntryDoc | null> {
  const {client, kb} = await getStoreScope(knowledgeBaseId)
  return client.context.fetch<Context.EntryDoc | null>(
    '*[_type == "sanity.context.entry" && knowledgeBaseId == $kb && path == $path][0]',
    {kb, path},
  )
}

/** List all issues of a knowledge base, optionally only those in one status */
export async function listIssues(
  knowledgeBaseId: string,
  status?: Context.IssueDoc['status'],
): Promise<Context.IssueDoc[]> {
  const {organizationId, publicId} = await getKnowledgeBase(knowledgeBaseId)
  const filter = `_type == "sanity.context.issue" && knowledgeBaseId == $kb${status === undefined ? '' : ' && status == $status'}`
  return drainByCreatedAt<Context.IssueDoc>(organizationId, filter, {
    kb: publicId,
    ...(status !== undefined && {status}),
  })
}

/** Get an issue by ID, or `null` when it doesn't exist */
export async function getIssue(
  knowledgeBaseId: string,
  issueId: string,
): Promise<Context.IssueDoc | null> {
  const {client, kb} = await getStoreScope(knowledgeBaseId)
  return client.context.fetch<Context.IssueDoc | null>(
    '*[_type == "sanity.context.issue" && knowledgeBaseId == $kb && _id == $id][0]',
    {id: issueId, kb},
  )
}

/** The configuration of an MCP endpoint, as create and update return it */
export type McpEndpoint = Context.Response<'POST /organizations/{organizationId}/mcp'>

/** List an organization's MCP endpoints, oldest first */
export async function listMcpEndpoints(organizationId: string): Promise<McpEndpoint[]> {
  const client = await getContextClient(organizationId)
  const docs = await client.context.fetch<Context.McpDoc[]>(
    `*[_type == "sanity.context.mcp" && organizationId == $org] | order(_createdAt asc, _id asc) [0...${MCP_LIST_LIMIT}]`,
    {org: organizationId},
  )
  const connectClient = client.withConfig({apiVersion: MCP_CONNECT_API_VERSION})
  return docs.map((doc) => toMcpEndpoint(connectClient, doc))
}

/**
 * Get an MCP endpoint by name or ID, or `null` when the organization has none.
 * Update and delete accept either, so the lookups guarding them must too.
 */
export async function getMcpEndpoint(
  organizationId: string,
  nameOrId: string,
): Promise<McpEndpoint | null> {
  const client = await getContextClient(organizationId)
  const doc = await client.context.fetch<Context.McpDoc | null>(
    '*[_type == "sanity.context.mcp" && organizationId == $org && (name == $nameOrId || publicId == $nameOrId)][0]',
    {nameOrId, org: organizationId},
  )
  return doc && toMcpEndpoint(client.withConfig({apiVersion: MCP_CONNECT_API_VERSION}), doc)
}

/**
 * The stored configuration in the shape create and edit return, so every command outputs the
 * same fields. The URL isn't stored, so it is built from the same route and API version.
 */
function toMcpEndpoint(
  connectClient: {getUrl: (uri: string) => string},
  doc: Context.McpDoc,
): McpEndpoint {
  return {
    createdAt: doc._createdAt,
    groqFilter: doc.groqFilter ?? null,
    id: doc.publicId,
    instructions: doc.instructions ?? null,
    lastUsedAt: doc.lastUsedAt ?? null,
    name: doc.name,
    organizationId: doc.organizationId,
    sources: doc.sources,
    title: doc.title,
    updatedAt: doc._updatedAt,
    url: connectClient.getUrl(
      `/context/organizations/${encodeURIComponent(doc.organizationId)}/mcp/${encodeURIComponent(doc.name)}`,
    ),
  }
}

/** Create an MCP endpoint */
export async function createMcpEndpoint(
  organizationId: string,
  body: Context.Body<'POST /organizations/{organizationId}/mcp'>,
): Promise<McpEndpoint> {
  const client = await getContextClient()
  return client.context.request('POST /organizations/{organizationId}/mcp', {
    body,
    params: {organizationId},
  })
}

/** Update an MCP endpoint's configuration */
export async function updateMcpEndpoint(
  organizationId: string,
  name: string,
  body: Context.Body<'PATCH /organizations/{organizationId}/mcp/{mcpEndpoint}'>,
): Promise<McpEndpoint> {
  const client = await getContextClient()
  return client.context.request('PATCH /organizations/{organizationId}/mcp/{mcpEndpoint}', {
    body,
    params: {mcpEndpoint: name, organizationId},
  })
}

/** Delete an MCP endpoint */
export async function deleteMcpEndpoint(organizationId: string, name: string): Promise<void> {
  const client = await getContextClient()
  await client.context.request('DELETE /organizations/{organizationId}/mcp/{mcpEndpoint}', {
    params: {mcpEndpoint: name, organizationId},
  })
}

/** The checks of whether agents can use an MCP endpoint */
export type McpEndpointStatus =
  Context.Response<'GET /organizations/{organizationId}/mcp/{mcpEndpoint}/status'>

/** Check whether an agent connecting with the current credentials can use an MCP endpoint */
export async function getMcpEndpointStatus(
  organizationId: string,
  name: string,
): Promise<McpEndpointStatus> {
  const client = await getContextClient()
  return client.context.request('GET /organizations/{organizationId}/mcp/{mcpEndpoint}/status', {
    params: {mcpEndpoint: name, organizationId},
  })
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
  {id}: Pick<McpEndpoint, 'id'>,
): Promise<BlueprintOwnership> {
  return getBlueprintOwnership('sanity.context.mcp', async () => ({organizationId, publicId: id}))
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
