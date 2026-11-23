import {getGlobalCliClient, subdebug} from '@sanity/cli-core'
import {EXPERIMENTAL_API_WARNING, isHttpError} from '@sanity/client'

import {getProjectById} from './projects.js'

const debug = subdebug('blueprints:ownership')
const projectQualifiedTypes = new Set([
  'sanity.project.cors',
  'sanity.project.dataset',
  'sanity.project.webhook',
])

export type BlueprintScope = {id: string; type: 'organization' | 'project'}

export type BlueprintOwnership =
  | {stackName: string | null; status: 'managed'}
  | {status: 'unknown'}
  | {status: 'unmanaged'}

export function isBlueprintManagedError(error: unknown): boolean {
  return isHttpError(error) && error.statusCode === 403 && errorCode(error) === 'RESOURCE_MANAGED'
}

export async function lookupBlueprintOwnership(
  scope: BlueprintScope,
  target: {id: string; type: string},
): Promise<BlueprintOwnership> {
  const qualified =
    target.type === 'sanity.access.robot' ||
    (scope.type === 'project' && projectQualifiedTypes.has(target.type))
  const externalId = qualified ? `${scope.id}:${target.id}` : target.id
  const resource = {...target, id: externalId}
  const ownership = await lookupInScope(scope, resource)
  if (scope.type === 'organization' || ownership.status !== 'unmanaged') return ownership

  try {
    const {organizationId} = await getProjectById(scope.id)
    if (!organizationId || organizationId === 'oSystemUnclaimed') return ownership
    return await lookupInScope({id: organizationId, type: 'organization'}, resource)
  } catch (error) {
    debug('Could not resolve organization for Blueprint ownership lookup', error)
    return {status: 'unknown'}
  }
}

async function lookupInScope(
  scope: BlueprintScope,
  target: {id: string; type: string},
): Promise<BlueprintOwnership> {
  try {
    const client = await getGlobalCliClient({
      apiVersion: 'vX',
      ignoreWarnings: [EXPERIMENTAL_API_WARNING, 'which will change without warning'],
      maxRetries: 0,
      requireUser: true,
      timeout: 5000,
    })
    const headers = {'x-sanity-scope-id': scope.id, 'x-sanity-scope-type': scope.type}
    const matches = await client.request<{stackId?: string}[]>({
      headers,
      query: target,
      url: '/blueprints/resources/search',
    })
    const stackId = matches.find(
      (match) => typeof match.stackId === 'string' && match.stackId,
    )?.stackId
    if (!stackId) return {status: matches.length === 0 ? 'unmanaged' : 'unknown'}

    const stackName = await client
      .request<{name?: string}>({
        headers,
        url: `/blueprints/stacks/${encodeURIComponent(stackId)}`,
      })
      .then((stack) => stack.name ?? null)
      .catch(() => null)
    return {stackName, status: 'managed'}
  } catch (error) {
    if (isBlueprintManagedError(error)) return {stackName: null, status: 'managed'}
    if (
      isHttpError(error) &&
      error.statusCode === 404 &&
      errorCode(error) === 'RESOURCE_NOT_MANAGED'
    ) {
      return {status: 'unmanaged'}
    }
    debug('Blueprint ownership lookup failed', error)
    return {status: 'unknown'}
  }
}

function errorCode(error: {response: {body: unknown}}): unknown {
  const {body} = error.response
  return body && typeof body === 'object' && 'errorCode' in body ? body.errorCode : undefined
}
