import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../actions/context/resolveOrganizationId.js'
import {listKnowledgeBases} from '../../services/context.js'
import {Table} from '../../util/responsiveTable.js'
import {getOrganizationFlag} from '../../util/sharedFlags.js'

const listContextDebug = subdebug('context:list')

export class ListKnowledgeBasesCommand extends SanityCommand<typeof ListKnowledgeBasesCommand> {
  static override description = 'List knowledge bases in an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List knowledge bases, selecting the organization interactively',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization org-abc123',
      description: 'List knowledge bases in a specific organization',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization org-abc123 --json',
      description: 'Output knowledge bases as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization to list knowledge bases for',
      semantics: 'override',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output knowledge bases in JSON format',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {json, organization} = this.flags

    let organizationId: string
    try {
      organizationId = await resolveOrganizationId({
        configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
        flagOrganizationId: organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      listContextDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    let knowledgeBases
    try {
      knowledgeBases = await listKnowledgeBases(organizationId)
    } catch (error) {
      listContextDebug('Error listing knowledge bases', error)
      this.error(`Failed to list knowledge bases: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.log(JSON.stringify(knowledgeBases, null, 2))
      return
    }

    if (knowledgeBases.length === 0) {
      this.log('No knowledge bases found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'title', title: 'Title'},
        {alignment: 'left', name: 'state', title: 'State'},
        {alignment: 'right', name: 'openIssues', title: 'Open issues'},
        {alignment: 'left', name: 'updatedAt', title: 'Updated'},
      ],
    })

    for (const {openIssueCount, publicId, state, title, updatedAt} of knowledgeBases) {
      table.addRow({id: publicId, openIssues: openIssueCount, state, title, updatedAt})
    }

    this.log(table.render())
  }
}
