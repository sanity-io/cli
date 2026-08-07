import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import sortBy from 'lodash-es/sortBy.js'

import {getMembersForProject} from '../../actions/users/getMembersForProject.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {Table} from '../../util/responsiveTable.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const sortFields = ['id', 'name', 'role', 'date']

function dimText(value: string, isDim: boolean): string {
  return isDim ? styleText('dim', value) : value
}

export class List extends SanityCommand<typeof List> {
  static override description = 'List project members'
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
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List users for a specific project',
    },
  ]
  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to list users for',
      semantics: 'override',
    }),
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

  static override hiddenAliases: string[] = ['user:list']

  public async run(): Promise<void> {
    const {invitations, order, robots, sort} = this.flags

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [
            {grant: 'read', permission: 'sanity.project'},
            {grant: 'read', permission: 'sanity.project.members'},
          ],
        }),
    })

    const members = await getMembersForProject({
      includeInvitations: invitations,
      includeRobots: robots,
      projectId,
    })

    if (members.length === 0) {
      this.log('No members found for this project.')
      return
    }

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

    const rows = (order === 'asc' ? ordered : ordered.toReversed()).map(
      ([id, name, roles, date]) => [id, name, roles, date.split('T')[0]],
    )

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'roles', title: 'Roles'},
        {alignment: 'left', name: 'date', title: 'Date'},
      ],
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

    this.log(table.render())
  }
}
