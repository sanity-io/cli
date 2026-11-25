import {CLIError} from '@oclif/core/errors'
import {exitCodes} from '@sanity/cli-core'
import {type CliConfig} from '@sanity/cli-core/config'
import {select} from '@sanity/cli-core/ux'

import {promptForDataset} from '../../prompts/promptForDataset.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getDeployedStack} from '../../services/blueprints.js'
import {listDatasets} from '../../services/datasets.js'
import {type CheckoutStack, getCheckoutBlueprint} from '../../util/checkoutBlueprint.js'

interface TargetOptions {
  loadCliConfig: () => Promise<CliConfig>
  unattended: boolean

  dataset?: string
  needsDataset?: boolean
  project?: string
}

interface CommandTarget {
  projectId: string

  dataset?: string
}

// Commands that need a dataset get a complete target or a usage error.
export function resolveCommandTarget(
  options: TargetOptions & {needsDataset: true},
): Promise<CommandTarget & {dataset: string}>
export function resolveCommandTarget(options: TargetOptions): Promise<CommandTarget>
export async function resolveCommandTarget({
  dataset: datasetFlag,
  loadCliConfig,
  needsDataset,
  project: projectFlag,
  unattended,
}: TargetOptions): Promise<CommandTarget> {
  if (projectFlag && (!needsDataset || datasetFlag)) {
    return {dataset: datasetFlag, projectId: projectFlag}
  }

  let checkout: CheckoutStack | undefined
  try {
    checkout = getCheckoutBlueprint()
  } catch (cause) {
    throw targetError(
      'Could not read the local Blueprint Stack link. Check .sanity/blueprint.config.json.',
      retryFlags(projectFlag, datasetFlag, needsDataset),
      cause,
    )
  }

  const studio = checkout ? undefined : (await loadCliConfig()).api
  const localProject = checkout?.scopeType === 'project' ? checkout.scopeId : studio?.projectId
  let projectId = projectFlag || localProject
  const sameProject = !projectFlag || projectFlag === localProject
  let dataset = datasetFlag || (sameProject ? studio?.dataset : undefined)
  const targetStack = sameProject || checkout?.scopeType === 'organization' ? checkout : undefined

  const stack =
    targetStack && (!projectId || (needsDataset && !dataset))
      ? await readStackTargets(targetStack, retryFlags(projectId, dataset, needsDataset))
      : undefined

  if (!projectId) {
    const projects = [...(stack?.projects ?? [])]
    const requestedDataset = dataset
    const matching = requestedDataset
      ? projects.filter((id) => stack?.datasets.get(id)?.has(requestedDataset))
      : projects
    const defaultProject = stack?.defaultProjectId ?? undefined
    const useDefaultProject =
      defaultProject && (!dataset || matching.length === 0 || matching.includes(defaultProject))
    projectId = useDefaultProject
      ? defaultProject
      : await selectStackTarget(matching.length > 0 ? matching : projects, 'project', unattended)
    if (!projectId) {
      if (unattended) {
        const reason = stack
          ? 'No deployed project found in the linked Stack.'
          : 'Project is required.'
        throw targetError(reason, retryFlags(projectId, dataset, needsDataset))
      }
      projectId = await promptForProject({
        organizationId: checkout?.scopeType === 'organization' ? checkout.scopeId : undefined,
      })
    }
  }

  if (needsDataset && !dataset) {
    dataset = await selectStackTarget(
      [...(stack?.datasets.get(projectId) ?? [])],
      'dataset',
      unattended,
    )
    if (!dataset && unattended) {
      const reason = stack
        ? 'No deployed dataset found in the linked Stack for this project.'
        : 'Dataset is required.'
      throw targetError(reason, '--dataset <name>')
    }
    if (!dataset) {
      const datasets = await listDatasets(projectId)
      if (datasets.length === 0) {
        throw targetError(
          'No datasets found in this project. Create a dataset or choose another project.',
          '--project <project-id> --dataset <name>',
        )
      }
      dataset = await promptForDataset({datasets})
    }
  }

  return {dataset, projectId}
}

async function readStackTargets({scopeId, scopeType, stackId}: CheckoutStack, flags: string) {
  try {
    const stack = await getDeployedStack({scopeId, scopeType, stackId})
    if (!Array.isArray(stack.resources)) throw new TypeError('Stack resources are missing')

    const projects = new Set<string>()
    const datasets = new Map<string, Set<string>>()
    for (const {externalId, type} of stack.resources) {
      if (!externalId) continue
      if (type === 'sanity.project') projects.add(externalId)
      if (type !== 'sanity.project.dataset') continue
      const [projectId, dataset, remainder] = externalId.split(':')
      if (!projectId || !dataset || remainder !== undefined) continue
      if (scopeType === 'project' && projectId !== scopeId) continue
      const names = datasets.get(projectId) ?? new Set<string>()
      names.add(dataset)
      datasets.set(projectId, names)
      projects.add(projectId)
    }
    return {datasets, defaultProjectId: stack.defaultProjectId, projects}
  } catch (cause) {
    throw targetError(`Could not read Stack ${stackId}. Check your Stack access.`, flags, cause)
  }
}

async function selectStackTarget(
  values: string[],
  kind: 'dataset' | 'project',
  unattended: boolean,
): Promise<string | undefined> {
  if (values.length < 2) return values[0]
  if (unattended) {
    const flag = kind === 'project' ? '--project <project-id>' : '--dataset <name>'
    throw targetError(`Multiple deployed ${kind}s match the linked Stack.`, flag)
  }
  return select({
    choices: values.toSorted().map((value) => ({name: value, value})),
    message: `Select a ${kind} from this Stack`,
  })
}

function retryFlags(project?: string, dataset?: string, needsDataset?: boolean): string {
  const flags = []
  if (!project) flags.push('--project <project-id>')
  if (needsDataset && !dataset) flags.push('--dataset <name>')
  return flags.join(' ')
}

function targetError(reason: string, flags: string, cause?: unknown): CLIError {
  return new CLIError(new Error(`${reason} Try again with \`${flags}\`.`, {cause}), {
    exit: exitCodes.USAGE_ERROR,
  })
}
