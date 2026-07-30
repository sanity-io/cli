import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import size from 'lodash-es/size.js'

import {formatKeyValue, sectionHeader} from '../../actions/debug/output.js'
import {getProjectClaimStatus} from '../../services/projects.js'
import {
  readUnclaimedProjects,
  removeUnclaimedProject,
  type UnclaimedProjectRecord,
} from '../../util/unclaimedProjects.js'

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

      const status = await getProjectClaimStatus(record.projectId, record.token)
      if (status === 'claimed') {
        if (this.removeClaimedProject(record)) {
          this.logClaimedProject(record.projectId)
        }
        return
      }
      if (status === 'unknown') {
        this.output.warn(
          `Could not verify whether project "${projectId}" is claimed. Local recovery details were kept. Run this command again to retry.`,
        )
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

    const checked = await Promise.all(
      records.map(async (record) => ({
        record,
        status: await getProjectClaimStatus(record.projectId, record.token),
      })),
    )
    records = []
    const claimedProjectIds: string[] = []
    for (const {record, status} of checked) {
      if (status === 'claimed') {
        if (this.removeClaimedProject(record)) {
          claimedProjectIds.push(record.projectId)
        }
        continue
      }
      if (status === 'unknown') {
        this.output.warn(
          `Could not verify whether project "${record.projectId}" is claimed. Local recovery details were kept. Run this command again to retry.`,
        )
      }
      records.push(record)
    }

    if (records.length === 0) {
      if (claimedProjectIds.length > 0) {
        for (const claimedProjectId of claimedProjectIds) {
          this.logClaimedProject(claimedProjectId)
        }
        return
      }
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
    if (claimedProjectIds.length > 0) {
      this.output.log()
      for (const claimedProjectId of claimedProjectIds) {
        this.logClaimedProject(claimedProjectId)
      }
    }
  }

  private logClaimedProject(projectId: string): void {
    this.output.log(
      `${logSymbols.success} Project "${projectId}" is claimed. Local recovery details removed.`,
    )
  }

  private removeClaimedProject(record: UnclaimedProjectRecord): boolean {
    const removed = removeUnclaimedProject(record.projectId, record.claimToken)
    if (!removed) {
      this.output.warn(
        `Project "${record.projectId}" is claimed, but its local recovery details could not be removed. Run this command again to retry.`,
      )
    }
    return removed
  }
}
