import {Args} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForOrganization} from '../../../../prompts/promptForOrganization.js'
import {deleteAttributeDefinition} from '../../../../services/userAttributes.js'
import {getErrorMessage} from '../../../../util/getErrorMessage.js'
import {getOrganizationFlag} from '../../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:definitions:delete')

export class UserAttributeDefinitionsDeleteCommand extends SanityCommand<
  typeof UserAttributeDefinitionsDeleteCommand
> {
  static override args = {
    key: Args.string({
      description: 'Attribute key to delete',
      required: true,
    }),
  }

  static override description = 'Delete a user attribute definition for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> location',
      description:
        'Delete the "location" user attribute definition (prompts for an organization in interactive mode)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> location --organization o123',
      description: 'Delete the "location" user attribute definition from a specific organization',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization ID to delete the attribute definition from',
      semantics: 'specify',
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:definitions:delete']

  public async run(): Promise<void> {
    const {key} = this.args
    const {organization: organizationFlag} = this.flags

    let orgId: string
    if (organizationFlag) {
      orgId = organizationFlag
    } else {
      try {
        orgId = await promptForOrganization()
      } catch (err) {
        if (err instanceof NonInteractiveError) {
          this.error('Organization ID is required. Use --organization to specify it.', {exit: 1})
        }
        throw err
      }
    }

    try {
      await deleteAttributeDefinition(orgId, key)
    } catch (err) {
      debug('Error deleting attribute definition', err)
      this.error(`Failed to delete attribute definition:\n${getErrorMessage(err)}`, {exit: 1})
    }

    this.log(`User attribute definition "${key}" deleted successfully.`)
  }
}
