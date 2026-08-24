import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'

import {getManageUrl} from '../../actions/projects/getManageUrl.js'
import {listProjects} from '../../services/projects.js'
import {Table} from '../../util/responsiveTable.js'
import {sortRowsByColumn} from '../../util/sortRowsByColumn.js'

const sortFields = ['id', 'members', 'name', 'url', 'created']

const projectsDebug = subdebug('projects')

export class List extends SanityCommand<typeof List> {
  static override description = 'List your projects'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List projects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sort=members --order=asc',
      description: 'List projects sorted by member count, ascending',
    },
  ]

  static override flags = {
    order: Flags.string({
      default: 'desc',
      description: 'Sort direction',
      options: ['asc', 'desc'],
    }),
    sort: Flags.string({
      default: 'created',
      description: 'Sort field',
      options: sortFields,
    }),
  }

  static override hiddenAliases: string[] = ['project:list']

  public async run() {
    const {order, sort} = this.flags

    try {
      const projects = await listProjects()
      const ordered = sortRowsByColumn(
        projects.map(({createdAt, displayName, id, members = []}) => {
          const manage = getManageUrl(id)
          return [id, members.length, displayName, manage, createdAt].map(String)
        }),
        sortFields.indexOf(sort),
      )

      const rows = order === 'asc' ? ordered : ordered.toReversed()
      const table = new Table({
        columns: [
          {alignment: 'left', name: 'id', title: 'ID'},
          {alignment: 'left', name: 'members', title: 'Members'},
          {alignment: 'left', name: 'name', title: 'Name'},
          {alignment: 'left', name: 'url', title: 'URL'},
          {alignment: 'left', name: 'created', title: 'Created'},
        ],
      })

      for (const [id, members, name, url, created] of rows) {
        table.addRow({created: created.split('T')[0], id, members, name, url})
      }

      this.log(table.render())
    } catch (error) {
      projectsDebug('Error listing projects', error)
      this.error('Failed to list projects', {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
