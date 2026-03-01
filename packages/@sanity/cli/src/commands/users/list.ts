import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {Table} from 'console-table-printer'
import sortBy from 'lodash-es/sortBy.js'

import {getMembersForProject} from '../../actions/users/getMembersForProject.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const sortFields = ['id', 'name', 'role', 'date']

function dimText(value: string, isDim: boolean): string {
  return isDim ? styleText('dim', value) : value
}

export class List extends SanityCommand<typeof List> {
  static override description = 'List all users of the project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all users of the project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --no-invitations --no-robots',
      description: 'List all users of the project, but exclude pending invitations and robots',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sort role',
      description: 'List all users, sorted by role',
    },
  ]
  static override flags = {
    invitations: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Includes or excludes pending invitations',
    }),
    order: Flags.string({
      default: 'asc',
      description: 'Sort output ascending/descending',
      options: ['asc', 'desc'],
    }),
    robots: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Includes or excludes robots (token users)',
    }),
    sort: Flags.string({
      default: 'date',
      description: 'Sort users by specified column',
      options: ['id', 'name', 'role', 'date'],
    }),
  }

  public async run(): Promise<void> {
    const {invitations, order, robots, sort} = this.flags

    const projectId = await this.getProjectId()

    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    const members = await getMembersForProject({
      includeInvitations: invitations,
      includeRobots: robots,
      projectId,
    })

    const ordered = sortBy(
      members.map(({date, id, name, roles}) => [
        id,
        name,
        roles
          ?.map((role) => role.title)
          .join(', ')
          .trim() || '-',
        date,
      ]),
      [sortFields.indexOf(sort)],
    )

    const rows = order === 'asc' ? ordered : ordered.toReversed()

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: 30, name: 'id', title: 'ID'},
        {alignment: 'left', maxLen: 40, name: 'name', title: 'Name'},
        {alignment: 'left', maxLen: 30, name: 'roles', title: 'Roles'},
        {alignment: 'left', maxLen: 12, name: 'date', title: 'Date'},
      ],
      rowSeparator: true,
    })

    for (const [id, name, roles, date] of rows) {
      const isPending = id === '<pending>'
      table.addRow({
        date: dimText(date, isPending),
        id: dimText(id, isPending),
        name: dimText(name, isPending),
        roles: dimText(roles, isPending),
      })
    }

    table.printTable()
  }
}
