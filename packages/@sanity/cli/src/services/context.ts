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
