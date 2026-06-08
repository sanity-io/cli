import {Flags} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForOrganization} from '../../../prompts/promptForOrganization.js'
import {deleteUserAttributes} from '../../../services/userAttributes.js'
import {getErrorMessage} from '../../../util/getErrorMessage.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:unset')

export class UserAttributesUnsetCommand extends SanityCommand<typeof UserAttributesUnsetCommand> {
  static override description = 'Remove attribute values for a user within an organization'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> --organization o123 --user-id u456 --key location',
      description: 'Remove a single attribute from a user',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --organization o123 --user-id u456 --key location --key dept',
      description: 'Remove multiple attributes from a user',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization ID',
      semantics: 'specify',
    }),
    key: Flags.string({
      description: 'Attribute key to remove (can be specified multiple times)',
      helpValue: '<key>',
      multiple: true,
      required: true,
    }),
    'user-id': Flags.string({
      description: 'User ID to remove attributes from',
      helpValue: '<userId>',
      required: true,
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:unset']

  public async run(): Promise<void> {
    const {key: keys, organization: organizationFlag, 'user-id': userId} = this.flags

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

    let result: Awaited<ReturnType<typeof deleteUserAttributes>>
    try {
      result = await deleteUserAttributes(orgId, userId, keys)
    } catch (err) {
      debug('Error removing user attributes', err)
      this.error(`Failed to remove attributes:\n${getErrorMessage(err)}`, {exit: 1})
    }

    this.log(
      `Attribute${keys.length === 1 ? '' : 's'} removed successfully for user ${result.sanityUserId}.`,
    )
  }
}
