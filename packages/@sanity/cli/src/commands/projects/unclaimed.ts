import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import size from 'lodash-es/size.js'

import {formatKeyValue, sectionHeader} from '../../actions/debug/output.js'
import {readUnclaimedProjects, type UnclaimedProjectRecord} from '../../util/unclaimedProjects.js'

const listFields = ['id', 'dataset', 'created', 'claim deadline', 'claim url']

function recordRow(record: UnclaimedProjectRecord): string[] {
  return [record.projectId, record.dataset, record.mintedAt, record.expiresAt, record.claimUrl]
}

function formatTable(fields: string[], rows: string[][]): string[] {
  const maxWidths = fields.map((field) => size(field))
  for (const row of rows) {
    for (const [index, value] of row.entries()) {
      maxWidths[index] = Math.max(size(value), maxWidths[index])
    }
  }

  const formatRow = (row: string[]) =>
    row.map((value, index) => value.padEnd(maxWidths[index])).join('   ')

  return [styleText('cyan', formatRow(fields)), ...rows.map((row) => formatRow(row))]
}

export class UnclaimedProjectsCommand extends SanityCommand<typeof UnclaimedProjectsCommand> {
  static override description = 'Recover details for unclaimed projects created on this machine'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List locally recorded unclaimed projects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'Show recovery details for one project',
    },
  ]

  static override flags = {
    'project-id': Flags.string({
      description: 'Project ID to recover',
    }),
  }

  static override hiddenAliases: string[] = ['project:unclaimed']

  public async run(): Promise<void> {
    let records: UnclaimedProjectRecord[]
    try {
      records = readUnclaimedProjects()
    } catch (error) {
      this.output.error(
        `Could not read local unclaimed projects: ${
          error instanceof Error ? error.message : String(error)
        } Remove or repair the "unclaimedProjects" entry in your Sanity user config.`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
      return
    }

    const projectId = this.flags['project-id']
    if (projectId) {
      const record = records.find((candidate) => candidate.projectId === projectId)
      if (!record) {
        this.output.error(
          `No local recovery record found for project "${projectId}". Run \`sanity projects unclaimed\` to list recorded projects.`,
          {exit: exitCodes.RUNTIME_ERROR},
        )
        return
      }

      this.output.log(sectionHeader('Project'))
      const details = [
        ['Project ID', record.projectId],
        ['Dataset', record.dataset],
        ['Created', record.mintedAt],
        ['Claim deadline', record.expiresAt],
        ['Claim URL', record.claimUrl],
        ['Access token', record.token],
      ]
      for (const [label, value] of details) {
        this.output.log(formatKeyValue(label, value, {padTo: 14}))
      }
      this.output.log()
      return
    }

    if (records.length === 0) {
      this.output.log(
        'No locally recorded unclaimed projects. Create one with `sanity new`, then return here if you need its recovery details.',
      )
      return
    }

    for (const line of formatTable(
      listFields,
      records.map((record) => recordRow(record)),
    )) {
      this.output.log(line)
    }
  }
}
