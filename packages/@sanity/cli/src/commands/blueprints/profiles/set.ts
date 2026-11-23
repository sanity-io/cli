import {resolve} from 'node:path'

import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {saveBlueprintProfile} from '@sanity/cli-core/config'
import {getCliExecutionContext} from '@sanity/cli-core/executionContext'

import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

export class SetBlueprintProfileCommand extends SanityCommand<typeof SetBlueprintProfileCommand> {
  static override args = {
    name: Args.string({description: 'Profile name', required: true}),
  }

  static override description =
    'Save a named Blueprint profile in your user configuration. Saving an existing name replaces the profile.'

  static override examples = [
    '<%= config.bin %> <%= command.id %> staging --project abc123 --dataset preview --stack ST-abc123',
    'SANITY_BLUEPRINT_PROFILE=staging <%= config.bin %> datasets list',
  ]

  static override flags = {
    dataset: Flags.string({dependsOn: ['project'], description: 'Default dataset'}),
    organization: Flags.string({description: 'Default organization ID'}),
    path: Flags.file({description: 'Path to the Blueprint manifest'}),
    project: Flags.string({description: 'Default project ID'}),
    stack: Flags.string({description: 'Default Stack ID'}),
  }

  static override hiddenAliases = ['blueprint:profiles:set']

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['path']})

  public async run(): Promise<void> {
    if (getCliExecutionContext()) {
      this.error('Run this command in your terminal to save a user profile.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }
    const {args, flags} = await this.parse(SetBlueprintProfileCommand)
    const path = await saveBlueprintProfile(args.name, {
      blueprintPath: flags.path ? resolve(flags.path) : undefined,
      dataset: flags.dataset,
      organizationId: flags.organization,
      projectId: flags.project,
      stackId: flags.stack,
    })
    this.log(`Saved Blueprint profile "${args.name}" at ${path}`)
    this.log(`Set SANITY_BLUEPRINT_PROFILE=${args.name} to use this profile.`)
  }
}
