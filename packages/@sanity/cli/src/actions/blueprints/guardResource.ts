import {doImport, exitCodes, type Output} from '@sanity/cli-core'

import {
  type BlueprintScope,
  isBlueprintManagedError,
  lookupBlueprintOwnership,
} from '../../services/blueprintOwnership.js'
import {getBlueprintCliContext} from '../../util/blueprintCliContext.js'

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

export function controlsResource(resource: Resource): boolean {
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
): Promise<{exitCode: number; message: string} | undefined> {
  const context = await getBlueprintCliContext()
  if (!context) return

  if (target.matches && context.blueprintPath && matchesManifestScope(context, scope)) {
    const loaded = await readBlueprintForCommand(context.blueprintPath)
    const blueprint = {...loaded, projectId: context.projectId}
    const matches = target.matches
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

  const ownership = await lookupBlueprintOwnership(scope, {id: target.id, type: target.type})
  if (ownership.status === 'managed') {
    return {
      exitCode: exitCodes.USAGE_ERROR,
      message: managedResourceMessage(target.label, change, ownership.stackName),
    }
  }
  if (ownership.status === 'unknown') {
    return {
      exitCode: exitCodes.RUNTIME_ERROR,
      message: `Could not verify Blueprint ownership for ${target.label}. Check your access to the project or organization. Run \`sanity debug\` to verify the active target.`,
    }
  }
}

function matchesManifestScope(
  context: NonNullable<Awaited<ReturnType<typeof getBlueprintCliContext>>>,
  scope: BlueprintScope,
): boolean {
  if (scope.type === 'project') return !context.projectId || context.projectId === scope.id
  return !context.projectId && context.organizationId === scope.id
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
    return {blueprint, resources}
  } catch (cause) {
    throw new Error(
      `Could not read ${path}. Fix the Blueprint and run \`sanity blueprints plan\`.`,
      {
        cause,
      },
    )
  }
}

export function managedResourceMessage(label: string, change: Change, stackName?: string | null) {
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
