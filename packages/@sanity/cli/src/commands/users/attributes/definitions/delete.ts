import {Args} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForOrganization} from '../../../../prompts/promptForOrganization.js'
import {deleteAttributeDefinition} from '../../../../services/userAttributes.js'
import {getErrorMessage} from '../../../../util/getErrorMessage.js'
import {getOrgIdFlag} from '../../../../util/sharedFlags.js'

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

  static override description = 'Delete an attribute definition for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123 location',
      description: 'Delete the "location" attribute definition',
    },
  ]

  static override flags = {
    ...getOrgIdFlag({
      description: 'Organization ID to delete the attribute definition from',
      semantics: 'specify',
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:definitions:delete']

  public async run(): Promise<void> {
    const {key} = this.args
    const {'org-id': orgIdFlag} = this.flags

    let orgId: string
    if (orgIdFlag) {
      orgId = orgIdFlag
    } else {
      try {
        orgId = await promptForOrganization()
      } catch (err) {
        if (err instanceof NonInteractiveError) {
          this.error('Organization ID is required. Use --org-id to specify it.', {exit: 1})
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

    this.log(`Attribute definition "${key}" deleted successfully.`)
  }
}
