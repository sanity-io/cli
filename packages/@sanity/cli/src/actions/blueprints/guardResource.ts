import {doImport, exitCodes, type Output} from '@sanity/cli-core'

import {getDeployedStack, isBlueprintManagedError} from '../../services/blueprints.js'
import {getProjectById} from '../../services/projects.js'
import {
  type CheckoutStack,
  getCheckoutBlueprint,
  getCheckoutManifest,
} from '../../util/checkoutBlueprint.js'

export type BlueprintScope = {id: string; type: 'organization' | 'project'}

const scopedResourceTypes = new Set([
  'sanity.access.robot',
  'sanity.project.cors',
  'sanity.project.dataset',
  'sanity.project.webhook',
])

type LocalBlueprint = Pick<
  Awaited<ReturnType<(typeof import('@sanity/blueprints/resolve'))['readBlueprint']>>,
  'blueprint' | 'projectId' | 'resources'
>
type Resource = LocalBlueprint['resources'][number]

type Target = {
  id: string
  label: string
  matches?: (resource: Resource, blueprint: LocalBlueprint) => boolean
  type: string
}

type Change = 'delete' | 'edit'

export function resourceAttachmentId(resource: Resource): string | undefined {
  const action = resource.lifecycle?.ownershipAction
  if (action?.type === 'attach') return action.id
}

function controlsResource(resource: Resource): boolean {
  const action = resource.lifecycle?.ownershipAction?.type
  return action !== 'reference' && action !== 'detach'
}

export function resourceValue(value: unknown, blueprint: LocalBlueprint): unknown {
  if (typeof value !== 'string' || !value.startsWith('$.values.')) return value
  return blueprint.blueprint.values?.[value.slice('$.values.'.length)]
}

export function matchesResourceProject(
  resource: Resource,
  blueprint: LocalBlueprint,
  projectId: string,
): boolean {
  const project = 'project' in resource ? resourceValue(resource.project, blueprint) : undefined
  return (project ?? blueprint.projectId) === projectId
}

export async function guardBlueprintResource(
  output: Pick<Output, 'error'>,
  scope: BlueprintScope,
  target: Target,
  change: Change,
): Promise<void> {
  const problem = await getBlueprintResourceProblem(scope, target, change)
  if (problem) output.error(problem.message, {exit: problem.exitCode})
}

export async function getBlueprintResourceProblem(
  scope: BlueprintScope,
  target: Target,
  change: Change,
  directory?: string,
): Promise<{exitCode: number; message: string} | undefined> {
  let stackId: string | undefined
  try {
    const checkout = getCheckoutBlueprint(directory)
    if (!checkout) return
    stackId = checkout.stackId
    if (!(await checkoutMatchesScope(checkout, scope))) return

    const path = getCheckoutManifest(checkout)
    const matches = target.matches
    if (matches && path) {
      const blueprint = await readBlueprintForCommand(path)
      if (checkout.scopeType === 'project') blueprint.projectId = checkout.scopeId
      if (
        blueprint.resources.some(
          (resource) =>
            resource.type === target.type &&
            controlsResource(resource) &&
            matches(resource, blueprint),
        )
      ) {
        return {
          exitCode: exitCodes.USAGE_ERROR,
          message: managedResourceMessage(target.label, change),
        }
      }
    }

    const stack = await getDeployedStack(checkout)
    const id = scopedResourceTypes.has(target.type) ? `${scope.id}:${target.id}` : target.id
    if (
      stack.resources.some(
        (resource) => resource.type === target.type && resource.externalId === id,
      )
    ) {
      return {
        exitCode: exitCodes.USAGE_ERROR,
        message: managedResourceMessage(target.label, change, stack.name),
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      exitCode: exitCodes.RUNTIME_ERROR,
      message: `Could not check whether the linked Stack${stackId ? ` ${stackId}` : ''} manages ${target.label}. ${reason}`,
    }
  }
}

export async function checkoutMatchesScope(
  checkout: CheckoutStack,
  scope: BlueprintScope,
): Promise<boolean> {
  if (checkout.scopeType === scope.type) return checkout.scopeId === scope.id
  if (scope.type === 'organization') return false
  const {organizationId} = await getProjectById(scope.id)
  return checkout.scopeId === organizationId
}

export function guardBlueprintDataset(
  output: Pick<Output, 'error'>,
  projectId: string,
  datasetName: string,
  change: Change,
): Promise<void> {
  return guardBlueprintResource(
    output,
    {id: projectId, type: 'project'},
    {
      id: datasetName,
      label: `dataset "${datasetName}"`,
      matches: (resource, blueprint) =>
        matchesResourceProject(resource, blueprint, projectId) &&
        'datasetName' in resource &&
        resourceValue(resource.datasetName, blueprint) === datasetName,
      type: 'sanity.project.dataset',
    },
    change,
  )
}

async function readBlueprintForCommand(path: string) {
  const {loadBlueprintFile} = (await doImport(
    import.meta.resolve('@sanity/blueprints/resolve'),
  )) as typeof import('@sanity/blueprints/resolve')
  try {
    const {blueprint} = await loadBlueprintFile(path)
    const resources = blueprint.resources ?? []
    if (!Array.isArray(resources)) throw new TypeError('Blueprint resources must be an array.')
    return {blueprint, projectId: undefined as string | undefined, resources}
  } catch (cause) {
    throw new Error(
      `Could not read ${path}. Fix the Blueprint and run \`sanity blueprints plan\`.`,
      {
        cause,
      },
    )
  }
}

function managedResourceMessage(label: string, change: Change, stackName?: string | null) {
  const owner = stackName ? `Blueprint Stack "${stackName}"` : 'A Blueprint'
  const instruction =
    change === 'delete'
      ? 'Update its lifecycle in the Blueprint, then run `sanity blueprints plan`.'
      : 'Make the change in the Blueprint, then run `sanity blueprints plan`.'
  return `${owner} manages ${label}. ${instruction}`
}

export function reportBlueprintManagedError(
  output: Pick<Output, 'error'>,
  error: unknown,
  label: string,
  change: Change,
): void {
  if (isBlueprintManagedError(error)) {
    output.error(managedResourceMessage(label, change), {exit: exitCodes.USAGE_ERROR})
  }
}
