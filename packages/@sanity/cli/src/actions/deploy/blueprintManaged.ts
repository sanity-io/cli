import {realpath} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'

import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'
import {exitCodes} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {type BlueprintScope} from '../../services/blueprintOwnership.js'
import {getBlueprintCliContext} from '../../util/blueprintCliContext.js'
import {type Check} from '../../util/checks.js'
import {
  controlsResource,
  getBlueprintResourceProblem,
  managedResourceMessage,
  matchesResourceProject,
  resourceAttachmentId,
  resourceValue,
} from '../blueprints/guardResource.js'
import {type DeployCheckReporter} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'

/**
 * The blueprint resource types a `deploy` can collide with, and the article the
 * message needs so both "a studio" and "an app" read naturally.
 */
const RESOURCES = {
  coreApp: {article: 'an', noun: 'app', type: 'sanity.application'},
  mediaLibrary: {article: 'a', noun: 'Media Library config', type: 'sanity.installation.config'},
  studio: {article: 'a', noun: 'studio', type: 'sanity.studio'},
} as const

type BlueprintManagedKind = keyof typeof RESOURCES

interface DeploymentResource {
  kind: BlueprintManagedKind

  id?: string
  scope?: BlueprintScope
  slug?: string
}

/**
 * A blueprint owns the deploys of the resources it declares, so the `deploy`
 * command must not ship one behind its back — the two would write the same
 * application from different sources of truth.
 *
 * Reports a `fail` when the directory being deployed is the root of a `kind`
 * resource in the blueprint next to it, which a real run exits on.
 */
export async function checkBlueprintManaged(
  reporter: DeployCheckReporter,
  target: DeploymentResource & {
    projectRootDir: string
  },
): Promise<void> {
  const {kind, projectRootDir} = target
  const {article, noun} = RESOURCES[kind]
  try {
    if (await isBlueprintManaged(projectRootDir, target)) {
      reporter.report({
        message: `Using the \`deploy\` command for ${article} ${noun} that is referenced by a blueprint is not allowed`,
        solution: `Deploy the ${noun} using the \`blueprints deploy\` command`,
        status: 'fail',
      })
    }
  } catch (error) {
    reporter.report({message: getErrorMessage(error), status: 'fail'})
  }
}

export async function checkBlueprintUndeploy(
  target: Omit<DeploymentResource, 'id'> & {
    directory: string
    getProjectRoot: () => Promise<string>
    ids: string[]
  },
): Promise<Check | undefined> {
  const {directory, ids, kind, scope} = target
  const [id] = ids
  const {noun, type} = RESOURCES[kind]
  const label = id ? `${noun} "${id}"` : noun
  if (await getBlueprintCliContext()) {
    if (!scope || !id) {
      return {
        exitCode: exitCodes.USAGE_ERROR,
        message: `Could not identify the Blueprint scope or resource ID for ${label}. Pass the app ID and select a profile with its project or organization.`,
        status: 'fail',
      }
    }
    for (const resourceId of ids) {
      const problem = await getBlueprintResourceProblem(
        scope,
        {
          id: resourceId,
          label: `${noun} "${resourceId}"`,
          matches: (resource) => resourceAttachmentId(resource) === resourceId,
          type,
        },
        'delete',
      )
      if (problem) return {...problem, status: 'fail'}
    }
    return
  }

  const path = findBlueprintFile(process.env.SANITY_BLUEPRINT_PATH || directory)
  if (path && (await isBlueprintManaged(await target.getProjectRoot(), {...target, id}, path))) {
    return {
      exitCode: exitCodes.USAGE_ERROR,
      message: managedResourceMessage(label, 'delete'),
      status: 'fail',
    }
  }
}

async function isBlueprintManaged(
  projectRootDir: string,
  {id, kind, scope, slug}: DeploymentResource,
  manifestPath?: string,
): Promise<boolean> {
  const blueprintFile =
    manifestPath ?? findBlueprintFile(process.env.SANITY_BLUEPRINT_PATH || projectRootDir)
  if (!blueprintFile) return false
  try {
    const blueprint = await readBlueprint({path: blueprintFile})
    const workDir = await canonicalPath(projectRootDir)
    for (const resource of blueprint.resources) {
      if (resource.type !== RESOURCES[kind].type || !controlsResource(resource)) continue
      if (
        kind === 'mediaLibrary' &&
        (!('appType' in resource) || resource.appType !== 'media-library')
      )
        continue
      if (
        scope?.type === 'organization' &&
        blueprint.organizationId &&
        scope.id !== blueprint.organizationId
      )
        continue
      if (
        scope?.type === 'project' &&
        (blueprint.projectId || 'project' in resource) &&
        !matchesResourceProject(resource, blueprint, scope.id)
      )
        continue

      const attachedId = resourceAttachmentId(resource)
      if (id && id === attachedId) return true
      if (slug && 'slug' in resource && resourceValue(resource.slug, blueprint) !== slug) continue
      if (!('root' in resource) || typeof resource.root !== 'string') continue
      if ((await canonicalPath(resolve(dirname(blueprintFile), resource.root))) === workDir)
        return true
    }
    return false
  } catch (err) {
    deployDebug('Error resolving the blueprint next to the deploy', err)
    return false
  }
}

function canonicalPath(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path))
}
