import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {resolveOrganizationId} from '../../../actions/context/resolveOrganizationId.js'
import {listMcpEndpoints} from '../../../services/context.js'
import {Table} from '../../../util/responsiveTable.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const listMcpDebug = subdebug('context:mcp:list')

export class ListMcpEndpointsCommand extends SanityCommand<typeof ListMcpEndpointsCommand> {
  static override description = 'List Context MCP endpoints in an organization'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List MCP endpoints, selecting the organization interactively',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization org-abc123 --json',
      description: 'Output the MCP endpoints of a specific organization as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization to list MCP endpoints for',
      semantics: 'override',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {json, organization} = this.flags

    const organizationId = await resolveOrganizationId({
      configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
      flagOrganizationId: organization,
      unattended: this.isUnattended(),
    })

    let endpoints
    try {
      endpoints = await listMcpEndpoints(organizationId)
    } catch (error) {
      listMcpDebug('Error listing MCP endpoints', error)
      this.error(`Failed to list MCP endpoints: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(endpoints)
      return
    }

    if (endpoints.length === 0) {
      this.log('No MCP endpoints found')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', name: 'name', title: 'Name'},
        {alignment: 'left', name: 'title', title: 'Title'},
        {alignment: 'left', name: 'sources', title: 'Sources'},
        {alignment: 'left', name: 'url', title: 'URL'},
      ],
    })

    for (const {name, sources, title, url} of endpoints) {
      table.addRow({name, sources: sources.map((source) => source.id).join(', '), title, url})
    }

    this.log(table.render())
  }
}
