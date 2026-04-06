import {Flags} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {type UserAttribute} from '../../../actions/userAttributes/types.js'
import {promptForOrganization} from '../../../prompts/promptForOrganization.js'
import {getMyAttributes, getUserAttributes} from '../../../services/userAttributes.js'
import {getErrorMessage} from '../../../util/getErrorMessage.js'
import {getOrgIdFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:list')

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}

export class UserAttributesListCommand extends SanityCommand<typeof UserAttributesListCommand> {
  static override description = 'List attributes for a user within an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123',
      description: 'List your own attributes in an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123 --user-id u456',
      description: "List a specific user's attributes",
    },
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123 --json',
      description: 'Output attributes as JSON',
    },
  ]

  static override flags = {
    ...getOrgIdFlag({
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
    const {json: outputJson, 'org-id': orgIdFlag, 'user-id': userId} = this.flags

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

    let result: Awaited<ReturnType<typeof getMyAttributes>>
    try {
      result = userId ? await getUserAttributes(orgId, userId) : await getMyAttributes(orgId)
    } catch (err) {
      debug('Error fetching user attributes', err)
      this.error(`Failed to fetch attributes:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(JSON.stringify(result, null, 2))
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

    for (const attr of attributes as UserAttribute[]) {
      table.addRow({
        activeSource: attr.activeSource,
        activeValue: formatValue(attr.activeValue),
        key: attr.key,
        type: attr.type,
      })
    }

    table.printTable()
  }
}
