import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {size, sortBy} from 'lodash-es'

import {listProjects} from '../../services/projects.js'

const sortFields = ['id', 'members', 'name', 'url', 'created']

const projectsDebug = subdebug('projects')

export class List extends SanityCommand<typeof List> {
  static override description = 'Lists projects connected to your user'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List projects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sort=members --order=asc',
      description: 'List all users of the project, but exclude pending invitations and robots',
    },
  ]

  static override flags = {
    order: Flags.string({
      default: 'desc',
      options: ['asc', 'desc'],
    }),
    sort: Flags.string({
      default: 'created',
      options: sortFields,
    }),
  }

  public async run() {
    const {order, sort} = this.flags

    try {
      const projects = await listProjects()
      const ordered = sortBy(
        projects.map(({createdAt, displayName, id, members = []}) => {
          const manage = `https://www.sanity.io/manage/project/${id}`
          return [id, members.length, displayName, manage, createdAt].map(String)
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
      projectsDebug('Error listing projects', error)
      this.error('Failed to list projects', {exit: 1})
    }
  }
}
