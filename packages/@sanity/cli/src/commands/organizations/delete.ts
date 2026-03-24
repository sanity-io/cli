import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {deleteOrganization} from '../../services/organizations.js'
import {hasStatusCode} from '../../util/apiError.js'

const deleteOrgDebug = subdebug('organizations:delete')

export class DeleteOrganizationCommand extends SanityCommand<typeof DeleteOrganizationCommand> {
  static override args = {
    orgId: Args.string({
      description: 'Organization ID to delete',
      required: true,
    }),
  }

  static override description = 'Delete an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123',
      description: 'Delete an organization (prompts for confirmation)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> org-abc123 --yes',
      description: 'Delete an organization without confirmation',
    },
  ]

  static override flags = {
    yes: Flags.boolean({
      aliases: ['y'],
      default: false,
      description: 'Skip confirmation prompt',
    }),
  } satisfies FlagInput

  static override hiddenAliases = [
    'organization:delete',
    'organisations:delete',
    'organisation:delete',
    'org:delete',
    'orgs:delete',
  ]

  public async run(): Promise<void> {
    const {orgId} = this.args
    const {yes} = this.flags

    if (!yes) {
      const confirmed = await confirm({
        default: false,
        message: `Are you sure you want to delete organization "${orgId}"? This cannot be undone.`,
      })

      if (!confirmed) {
        this.log('Operation cancelled')
        return
      }
    }

    const spin = spinner('Deleting organization').start()
    try {
      await deleteOrganization(orgId)
      spin.succeed()
      this.log('Organization deleted')
    } catch (error) {
      spin.fail()
      deleteOrgDebug('Error deleting organization', error)
      if (hasStatusCode(error) && error.statusCode === 404) {
        this.error(`Organization "${orgId}" not found`, {exit: 1})
      }
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to delete organization: ${message}`, {exit: 1})
    }
  }
}
