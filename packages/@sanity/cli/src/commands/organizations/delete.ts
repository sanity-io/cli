import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {input, logSymbols, spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {deleteOrganization, getOrganization} from '../../services/organizations.js'
import {organizationAliases} from '../../util/organizationAliases.js'

const deleteOrgDebug = subdebug('organizations:delete')

export class DeleteOrganizationCommand extends SanityCommand<typeof DeleteOrganizationCommand> {
  static override args = {
    organizationId: Args.string({
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
      command: '<%= config.bin %> <%= command.id %> org-abc123 --force',
      description: 'Delete an organization without confirmation',
    },
  ]

  static override flags = {
    force: Flags.boolean({
      description: 'Do not prompt for delete confirmation - forcefully delete',
      required: false,
    }),
  } satisfies FlagInput

  static override hiddenAliases = organizationAliases('delete')

  public async run(): Promise<void> {
    const {organizationId} = this.args
    const {force} = this.flags

    if (force) {
      this.warn(`'--force' used: skipping confirmation, deleting organization "${organizationId}"`)
    } else {
      await this.confirmDeletion(organizationId)
    }

    const spin = spinner('Deleting organization').start()
    try {
      await deleteOrganization(organizationId)
      spin.succeed()
      this.log('Organization deleted')
    } catch (error) {
      spin.fail()
      deleteOrgDebug('Error deleting organization', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Organization "${organizationId}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Failed to delete organization: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  private async confirmDeletion(organizationId: string): Promise<void> {
    let orgName: string
    try {
      const org = await getOrganization(organizationId)
      orgName = org.name
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      deleteOrgDebug(`Error getting organization ${organizationId}`, err)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Organization "${organizationId}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Organization retrieval failed: ${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }

    this.log(
      styleText(
        'yellow',
        `${logSymbols.warning} Deleting organization "${styleText(['bold', 'underline'], orgName)}"\n`,
      ),
    )

    try {
      await input({
        message:
          'Are you ABSOLUTELY sure you want to delete this organization?\n  Type the name of the organization to confirm delete:',
        validate: (value) => {
          const trimmed = value.trim().toLowerCase()
          return (
            trimmed === orgName.trim().toLowerCase() ||
            'Incorrect organization name. Ctrl + C to cancel delete.'
          )
        },
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(`${error}`)
      deleteOrgDebug(`User cancelled`, err)
      this.error(`User cancelled`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
