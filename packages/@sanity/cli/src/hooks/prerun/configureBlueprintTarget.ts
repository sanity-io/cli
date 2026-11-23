import {type Hook} from '@oclif/core'
import {exitCodes} from '@sanity/cli-core'

import {getBlueprintCliContext} from '../../util/blueprintCliContext.js'

export const configureBlueprintTarget: Hook.Prerun = async function ({Command, config}) {
  const id = Command.id
  if (!id || id.startsWith('blueprints:profiles:')) return
  if (!id.startsWith('blueprints:') && !id.startsWith('functions:')) return

  const context = await getBlueprintCliContext()
  if (!context) return

  if (id === 'blueprints:config' || id === 'blueprints:init' || id === 'blueprints:doctor') {
    this.error(
      'This command uses a local Stack link. To save a global target, run `sanity blueprints profiles set --help`. To inspect your active target, run `sanity debug`. To use a local Stack link, set SANITY_CLI_MODE=legacy.',
      {exit: exitCodes.USAGE_ERROR},
    )
  }

  const runtime = config.plugins.get('@sanity/runtime-cli')
  if (
    !runtime ||
    !('sanityBlueprintExplicitTargets' in runtime.pjson) ||
    runtime.pjson.sanityBlueprintExplicitTargets !== true
  ) {
    this.error(
      'This version of the Runtime CLI does not support Blueprint profiles. Update the Sanity CLI to use a profile with this command.',
      {exit: exitCodes.USAGE_ERROR},
    )
  }

  process.env.SANITY_BLUEPRINT_EXPLICIT_TARGETS = '1'
  if (context.blueprintPath) process.env.SANITY_BLUEPRINT_PATH = context.blueprintPath
  if (context.organizationId) process.env.SANITY_ORGANIZATION_ID = context.organizationId
  if (context.projectId) process.env.SANITY_PROJECT_ID = context.projectId
  if (context.stackId) process.env.SANITY_BLUEPRINT_STACK_ID = context.stackId
}
