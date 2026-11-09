import {dirname, join, relative} from 'node:path'

import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'

import {type DeployCheckReporter} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'

/**
 * The blueprint resource types a `deploy` can collide with, and the article the
 * message needs so both "a studio" and "an app" read naturally.
 */
const RESOURCES = {
  coreApp: {article: 'an', noun: 'app', type: 'sanity.application'},
  studio: {article: 'a', noun: 'studio', type: 'sanity.studio'},
} as const

type BlueprintManagedKind = keyof typeof RESOURCES

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
  {kind, projectRootDir}: {kind: BlueprintManagedKind; projectRootDir: string},
): Promise<void> {
  if (!(await isBlueprintManaged(kind, projectRootDir))) return

  const {article, noun} = RESOURCES[kind]
  reporter.report({
    message: `Using the \`deploy\` command for ${article} ${noun} that is referenced by a blueprint is not allowed`,
    solution: `Deploy the ${noun} using the \`blueprints deploy\` command`,
    status: 'fail',
  })
}

/**
 * Determine if the directory being deployed is referenced by a blueprint.
 * @param kind - The kind of resource being deployed
 * @param projectRootDir - The root directory of the studio or app
 */
async function isBlueprintManaged(
  kind: BlueprintManagedKind,
  projectRootDir: string,
): Promise<boolean> {
  try {
    const blueprintFile = findBlueprintFile(projectRootDir)
    if (!blueprintFile) return false

    const localBlueprint = await readBlueprint({
      path: blueprintFile,
    })

    return localBlueprint.resources.some((r) => {
      if (r.type === RESOURCES[kind].type && 'root' in r && typeof r.root === 'string') {
        return relative(join(dirname(blueprintFile), r.root), projectRootDir) === ''
      }

      return false
    })
  } catch (err) {
    deployDebug('Error resolving the blueprint next to the deploy', err)
    return false // fail open
  }
}
