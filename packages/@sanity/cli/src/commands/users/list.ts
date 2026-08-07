import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {Table} from 'console-table-printer'
import sortBy from 'lodash-es/sortBy.js'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

import {getMembersForProject} from '../../actions/users/getMembersForProject.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const sortFields = ['id', 'name', 'role', 'date']
const columnTitles = ['ID', 'Name', 'Roles', 'Date']

function dimText(value: string, isDim: boolean): string {
  return isDim ? styleText('dim', value) : value
}

function wrapCell(value: string, width: number, isDim: boolean): string {
  return wrapAnsi(dimText(value, isDim), width, {hard: true})
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

    const minimumColumnWidths = columnTitles.map((title) => stringWidth(title))
    const columnWidths = columnTitles.map((title, index) =>
      Math.max(stringWidth(title), ...rows.map((row) => stringWidth(row[index]))),
    )
    const cellPaddingWidth = 2
    const borderCharacterWidth = 1
    const borderWidth =
      borderCharacterWidth + columnTitles.length * (cellPaddingWidth + borderCharacterWidth)
    const minimumContentWidth = minimumColumnWidths.reduce((total, width) => total + width, 0)
    const availableContentWidth = Math.max(
      (process.stdout.columns || Infinity) - borderWidth,
      minimumContentWidth,
    )

    let excessWidth =
      columnWidths.reduce((total, width) => total + width, 0) - availableContentWidth
    while (excessWidth > 0) {
      const widestColumnIndex = columnWidths
        .map((width, index) => ({index, width: width - minimumColumnWidths[index]}))
        .toSorted((left, right) => right.width - left.width)[0].index
      columnWidths[widestColumnIndex] -= 1
      excessWidth -= 1
    }

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: columnWidths[0], name: 'id', title: columnTitles[0]},
        {alignment: 'left', maxLen: columnWidths[1], name: 'name', title: columnTitles[1]},
        {alignment: 'left', maxLen: columnWidths[2], name: 'roles', title: columnTitles[2]},
        {alignment: 'left', maxLen: columnWidths[3], name: 'date', title: columnTitles[3]},
      ],
      rowSeparator: true,
    })

    for (const [id, name, roles, date] of rows) {
      const isPending = id === '<pending>'
      table.addRow({
        date: wrapCell(date, columnWidths[3], isPending),
        id: wrapCell(id, columnWidths[0], isPending),
        name: wrapCell(name, columnWidths[1], isPending),
        roles: wrapCell(roles, columnWidths[2], isPending),
      })
    }

    this.log(table.render())
  }
}
