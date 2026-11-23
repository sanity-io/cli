import {createHash} from 'node:crypto'

import {type Output} from '@sanity/cli-core'

import {getBlueprintCliContext} from '../../util/blueprintCliContext.js'

export async function getBlueprintForProject(projectId: string) {
  const context = await getBlueprintCliContext()
  if (!context) return
  return {
    path: !context.projectId || context.projectId === projectId ? context.blueprintPath : undefined,
  }
}

export async function getBlueprintForOrganization(organizationId: string) {
  const context = await getBlueprintCliContext()
  if (!context) return
  return {
    path:
      !context.projectId && (!context.organizationId || context.organizationId === organizationId)
        ? context.blueprintPath
        : undefined,
  }
}

export function blueprintResourceName(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}

export function printBlueprintResource(
  output: Pick<Output, 'log' | 'logJson'>,
  path: string | undefined,
  resource: object | object[],
  asJson = false,
): void {
  const resources = Array.isArray(resource) ? resource : [resource]
  if (asJson) {
    output.logJson({...(path ? {blueprintPath: path} : {}), resources})
    return
  }
  const description = resources.length === 1 ? 'this resource' : 'these resources'
  const destination = path ?? 'your Blueprint manifest'
  output.log(
    `Add ${description} to the resources array in ${destination}, then run \`sanity blueprints plan\`.`,
  )
  for (const entry of resources) output.log(JSON.stringify(entry, null, 2))
}
