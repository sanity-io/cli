import {createHash} from 'node:crypto'

import {type Output, subdebug} from '@sanity/cli-core'

import {getCheckoutBlueprint, getCheckoutManifest} from '../../util/checkoutBlueprint.js'
import {type BlueprintScope, checkoutMatchesScope} from './guardResource.js'

const debug = subdebug('blueprints:declarations')

export async function getBlueprintForScope(scope: BlueprintScope): Promise<string | undefined> {
  try {
    const checkout = getCheckoutBlueprint()
    if (!checkout || !(await checkoutMatchesScope(checkout, scope))) return
    return getCheckoutManifest(checkout)
  } catch (error) {
    debug('Could not find a local manifest for the requested scope', error)
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
