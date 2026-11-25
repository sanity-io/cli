import {
  DEFAULT_BLUEPRINTS_API_VERSION,
  type DeployedStack,
  type ScopeType,
} from '@sanity/blueprints/resolve'
import {getGlobalCliClient} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

export async function getDeployedStack({
  scopeId,
  scopeType,
  stackId,
}: {
  scopeId: string
  scopeType: ScopeType
  stackId: string
}): Promise<DeployedStack> {
  const client = await getGlobalCliClient({
    apiVersion: process.env.SANITY_BLUEPRINTS_API_VERSION ?? DEFAULT_BLUEPRINTS_API_VERSION,
    maxRetries: 0,
    requireUser: true,
  })
  return client.request<DeployedStack>({
    headers: {'x-sanity-scope-id': scopeId, 'x-sanity-scope-type': scopeType},
    url: `/blueprints/stacks/${encodeURIComponent(stackId)}`,
  })
}

export function isBlueprintManagedError(error: unknown): boolean {
  if (!isHttpError(error) || error.statusCode !== 403) return false
  const {body} = error.response
  return (
    body !== null &&
    typeof body === 'object' &&
    'errorCode' in body &&
    body.errorCode === 'RESOURCE_MANAGED'
  )
}
