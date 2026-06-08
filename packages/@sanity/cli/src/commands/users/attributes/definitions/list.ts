import {Flags} from '@oclif/core'
import {colorizeJson, NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {promptForOrganization} from '../../../../prompts/promptForOrganization.js'
import {listAttributeDefinitions} from '../../../../services/userAttributes.js'
import {getErrorMessage} from '../../../../util/getErrorMessage.js'
import {getOrganizationFlag} from '../../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:definitions:list')

export class UserAttributeDefinitionsListCommand extends SanityCommand<
  typeof UserAttributeDefinitionsListCommand
> {
  static override description = 'List user attribute definitions for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description:
        'List user attribute definitions (prompts for an organization in interactive mode)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization o123',
      description: 'List user attribute definitions for a specific organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization o123 --json',
      description: 'Output definitions as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization ID to list attribute definitions for',
      semantics: 'specify',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output definitions in JSON format',
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:definitions:list']

  public async run(): Promise<void> {
    const {json: outputJson, organization: organizationFlag} = this.flags

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

    let result: Awaited<ReturnType<typeof listAttributeDefinitions>>
    try {
      result = await listAttributeDefinitions(orgId)
    } catch (err) {
      debug('Error fetching attribute definitions', err)
      this.error(`Failed to fetch attribute definitions:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(colorizeJson(result))
      return
    }

    const {definitions} = result

    if (definitions.length === 0) {
      this.log('No user attribute definitions found.')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: 40, name: 'key', title: 'Key'},
        {alignment: 'left', maxLen: 15, name: 'type', title: 'Type'},
        {alignment: 'left', maxLen: 20, name: 'sources', title: 'Sources'},
        {alignment: 'left', maxLen: 25, name: 'createdAt', title: 'Created At'},
      ],
    })

    for (const def of definitions) {
      table.addRow({
        createdAt: def.createdAt,
        key: def.key,
        sources: def.sources.join(', '),
        type: def.type,
      })
    }

    table.printTable()

    if (result.hasMore) {
      this.log(
        '\nNote: Results are truncated. Use --json and the API directly with a cursor to fetch more.',
      )
    }
  }
}
