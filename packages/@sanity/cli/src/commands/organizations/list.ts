import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import size from 'lodash-es/size.js'
import sortBy from 'lodash-es/sortBy.js'

import {listOrganizations} from '../../services/organizations.js'

const sortFields = ['id', 'name', 'slug']

const organizationsDebug = subdebug('organizations')

export class List extends SanityCommand<typeof List> {
  static override description = 'List your organizations'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List organizations',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'List organizations in JSON format',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sort=name --order=asc',
      description: 'List organizations sorted by name, ascending',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output organizations in JSON format',
    }),
    order: Flags.string({
      default: 'asc',
      description: 'Sort direction',
      options: ['asc', 'desc'],
    }),
    sort: Flags.string({
      default: 'id',
      description: 'Sort field',
      options: sortFields,
    }),
  }

  static override hiddenAliases: string[] = ['organization:list']

  public async run() {
    const {json, order, sort} = this.flags

    let organizations
    try {
      organizations = await listOrganizations()
    } catch (error) {
      organizationsDebug('Error listing organizations', error)
      this.error('Failed to list organizations', {exit: 1})
    }

    if (json) {
      this.log(JSON.stringify(organizations, null, 2))
      return
    }

    const ordered = sortBy(
      organizations.map(({id, name, slug}) => [id, name, slug].map(String)),
      [sortFields.indexOf(sort)],
    )

    const rows = order === 'asc' ? ordered : ordered.toReversed()

    const maxWidths = sortFields.map((str) => size(str))

    for (const row of rows) {
      for (const [i, element] of row.entries()) {
        maxWidths[i] = Math.max(size(element), maxWidths[i])
      }
    }

    const printRow = (row: string[]) =>
      row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')

    this.log(styleText('cyan', printRow(sortFields)))
    for (const row of rows) this.log(printRow(row))
  }
}
