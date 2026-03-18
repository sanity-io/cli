import {styleText} from 'node:util'

import {SanityCommand, subdebug} from '@sanity/cli-core'

import {listOrganizations} from '../../services/organizations.js'

const listOrgsDebug = subdebug('organizations:list')

export class ListOrganizationsCommand extends SanityCommand<typeof ListOrganizationsCommand> {
  static override description = 'List organizations you are a member of'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all your organizations',
    },
  ]

  static override hiddenAliases = [
    'organization:list',
    'organisations:list',
    'organisation:list',
    'org:list',
    'orgs:list',
  ]

  public async run(): Promise<void> {
    let organizations
    try {
      organizations = await listOrganizations()
    } catch (error) {
      listOrgsDebug('Error listing organizations', error)
      this.error('Failed to list organizations', {exit: 1})
    }

    if (organizations.length === 0) {
      this.log('No organizations found')
      return
    }

    const headers = ['ID', 'Name', 'Slug']
    const rows = organizations.map(({id, name, slug}) => [id, name, slug ?? '-'])

    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))

    const fmt = (row: string[]) => row.map((col, i) => col.padEnd(widths[i])).join('   ')

    this.log(styleText('cyan', fmt(headers)))
    for (const row of rows) this.log(fmt(row))
  }
}
