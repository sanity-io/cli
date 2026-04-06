import {Flags} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {promptForOrganization} from '../../../../prompts/promptForOrganization.js'
import {listAttributeDefinitions} from '../../../../services/userAttributes.js'
import {getErrorMessage} from '../../../../util/getErrorMessage.js'
import {getOrgIdFlag} from '../../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:definitions:list')

export class UserAttributeDefinitionsListCommand extends SanityCommand<
  typeof UserAttributeDefinitionsListCommand
> {
  static override description = 'List attribute definitions for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123',
      description: 'List attribute definitions for an organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --org-id o123 --json',
      description: 'Output definitions as JSON',
    },
  ]

  static override flags = {
    ...getOrgIdFlag({
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
    const {json: outputJson, 'org-id': orgIdFlag} = this.flags

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

    let result: Awaited<ReturnType<typeof listAttributeDefinitions>>
    try {
      result = await listAttributeDefinitions(orgId)
    } catch (err) {
      debug('Error fetching attribute definitions', err)
      this.error(`Failed to fetch attribute definitions:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const {definitions} = result

    if (definitions.length === 0) {
      this.log('No attribute definitions found.')
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
  }
}
