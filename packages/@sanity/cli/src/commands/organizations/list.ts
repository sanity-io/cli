import {SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {listOrganizations} from '../../services/organizations.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {organizationAliases} from '../../util/organizationAliases.js'

const listOrgsDebug = subdebug('organizations:list')

export class ListOrganizationsCommand extends SanityCommand<typeof ListOrganizationsCommand> {
  static override description = 'List organizations you are a member of'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all your organizations',
    },
  ]

  static override hiddenAliases = organizationAliases('list')

  public async run(): Promise<void> {
    let organizations
    try {
      organizations = await listOrganizations()
    } catch (error) {
      listOrgsDebug('Error listing organizations', error)
      this.error(`Failed to list organizations: ${getErrorMessage(error)}`, {exit: 1})
    }

    if (organizations.length === 0) {
      this.log('No organizations found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'slug', title: 'Slug'},
      ],
    })

    for (const {id, name, slug} of organizations) {
      table.addRow({id, name, slug: slug ?? '-'})
    }

    table.printTable()
  }
}
