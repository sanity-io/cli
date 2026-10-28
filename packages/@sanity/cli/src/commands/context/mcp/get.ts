import {Args} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {formatMcpEndpoint} from '../../../actions/context/mcpEndpoint.js'
import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../../actions/context/resolveOrganizationId.js'
import {getMcpEndpoint} from '../../../services/context.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const getMcpDebug = subdebug('context:mcp:get')

export class GetMcpEndpointCommand extends SanityCommand<typeof GetMcpEndpointCommand> {
  static override args = {
    name: Args.string({
      description: 'MCP endpoint name, as in its URL',
      required: true,
    }),
  }

  static override description = 'Get details of a Context MCP endpoint, including its URL'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> support',
      description: 'Get details of the "support" MCP endpoint',
    },
    {
      command: '<%= config.bin %> <%= command.id %> support --organization org-abc123 --json',
      description: 'Output an MCP endpoint in a specific organization as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization the MCP endpoint belongs to',
      semantics: 'override',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {name} = this.args
    const {json, organization} = this.flags

    let organizationId: string
    try {
      organizationId = await resolveOrganizationId({
        configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
        flagOrganizationId: organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      getMcpDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    let endpoint
    try {
      endpoint = await getMcpEndpoint(organizationId, name)
    } catch (error) {
      getMcpDebug('Error getting MCP endpoint', error)
      this.error(`Failed to get MCP endpoint: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (!endpoint) {
      this.error(`MCP endpoint "${name}" not found`, {exit: exitCodes.RUNTIME_ERROR})
    }

    if (json) {
      this.logJson(endpoint)
      return
    }

    for (const line of formatMcpEndpoint({...endpoint, id: endpoint.publicId})) {
      this.log(line)
    }
  }
}
