import {Flags} from '@oclif/core'
import {colorizeJson, NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {promptForOrganization} from '../../../prompts/promptForOrganization.js'
import {getCliUserAttributes, getUserAttributes} from '../../../services/userAttributes.js'
import {formatAttributeValue} from '../../../util/formatAttributeValue.js'
import {getErrorMessage} from '../../../util/getErrorMessage.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:list')

export class UserAttributesListCommand extends SanityCommand<typeof UserAttributesListCommand> {
  static override description = 'List attributes for a user within an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --organization o123',
      description: 'List your own attributes in an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization o123 --user-id u456',
      description: "List a specific user's attributes",
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization o123 --json',
      description: 'Output attributes as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization ID to list attributes for',
      semantics: 'specify',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output attributes in JSON format',
    }),
    'user-id': Flags.string({
      description:
        'User ID to list attributes for. Defaults to the authenticated user when not provided.',
      helpValue: '<userId>',
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:list']

  public async run(): Promise<void> {
    const {json: outputJson, organization: organizationFlag, 'user-id': userId} = this.flags

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

    let result: Awaited<ReturnType<typeof getCliUserAttributes>>
    try {
      result = userId ? await getUserAttributes(orgId, userId) : await getCliUserAttributes(orgId)
    } catch (err) {
      debug('Error fetching user attributes', err)
      this.error(`Failed to fetch attributes:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(colorizeJson(result))
      return
    }

    const {attributes} = result

    if (attributes.length === 0) {
      this.log('No attributes found.')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: 40, name: 'key', title: 'Key'},
        {alignment: 'left', maxLen: 15, name: 'type', title: 'Type'},
        {alignment: 'left', maxLen: 10, name: 'activeSource', title: 'Source'},
        {alignment: 'left', maxLen: 40, name: 'activeValue', title: 'Active Value'},
      ],
    })

    for (const attr of attributes) {
      table.addRow({
        activeSource: attr.activeSource,
        activeValue: formatAttributeValue(attr.activeValue),
        key: attr.key,
        type: attr.type,
      })
    }

    table.printTable()
  }
}
