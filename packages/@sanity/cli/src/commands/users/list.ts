import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import chalk from 'chalk'
import {size, sortBy} from 'lodash-es'

import {USERS_API_VERSION} from '../../actions/users/apiVersion.js'
import {getMembersForProject} from '../../actions/users/getMembersForProject.js'

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

  private readonly sortFields = ['id', 'name', 'role', 'date']

  public async run(): Promise<void> {
    const {invitations, order, robots, sort} = this.flags

    const client = await this.getGlobalApiClient({
      apiVersion: USERS_API_VERSION,
      requireUser: true,
    })

    const projectId = await this.getProjectId()

    if (!projectId) {
      throw new Error('No project ID found')
    }

    const members = await getMembersForProject({
      client,
      includeInvitations: invitations,
      includeRobots: robots,
      projectId,
    })

    const ordered = sortBy(
      members.map(({date, id, name, role}) => [id, name, role, date]),
      [this.sortFields.indexOf(sort)],
    )

    const rows = order === 'asc' ? ordered : ordered.reverse()

    // Initialize maxWidths with the width of each header
    const maxWidths = this.sortFields.map((str) => size(str))

    // Calculate maximum width for each column
    for (const row of rows) {
      for (const [i, element] of row.entries()) {
        maxWidths[i] = Math.max(size(element), maxWidths[i])
      }
    }

    const printRow = (row: string[]) => {
      const isInvite = row[0] === '<pending>'
      const textRow = row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')
      return isInvite ? chalk.dim(textRow) : textRow
    }

    this.log(chalk.cyan(printRow(this.sortFields)))
    for (const row of rows) {
      this.log(printRow(row))
    }
  }
}
