import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import size from 'lodash-es/size.js'
import sortBy from 'lodash-es/sortBy.js'

import {listOrganizations} from '../../services/organizations.js'

const sortFields = ['id', 'name', 'slug']

const debug = subdebug('organizations')

export class ListOrganizationsCommand extends SanityCommand<typeof ListOrganizationsCommand> {
  static override description = 'Lists organizations you have access to'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List organizations',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sort=name --order=desc',
      description: 'List organizations sorted by name in descending order',
    },
  ]

  static override flags = {
    order: Flags.string({
      default: 'asc',
      options: ['asc', 'desc'],
    }),
    sort: Flags.string({
      default: 'name',
      options: sortFields,
    }),
  }

  static override hiddenAliases: string[] = ['organization:list']

  public async run() {
    const {order, sort} = this.flags

    try {
      const organizations = await listOrganizations()
      const ordered = sortBy(
        organizations.map(({id, name, slug}) => {
          return [id, name, slug ?? ''].map(String)
        }),
        [sortFields.indexOf(sort)],
      )

      const rows = order === 'asc' ? ordered : ordered.toReversed()

      // Initialize maxWidths with the width of each header
      const maxWidths = sortFields.map((str) => size(str))

      // Calculate maximum width for each column
      for (const row of rows) {
        for (const [i, element] of row.entries()) {
          maxWidths[i] = Math.max(size(element), maxWidths[i])
        }
      }

      const printRow = (row: string[]) =>
        row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')

      this.log(styleText('cyan', printRow(sortFields)))
      for (const row of rows) this.log(printRow(row))
    } catch (error) {
      debug('Error listing organizations', error)
      this.error('Failed to list organizations', {exit: 1})
    }
  }
}
