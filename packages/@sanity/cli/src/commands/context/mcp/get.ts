import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {
  findMcpEndpoint,
  formatMcpEndpoint,
  mcpEndpointNameArg,
  mcpEndpointOrganizationFlag,
} from '../../../actions/context/mcpEndpoint.js'
import {resolveOrganizationId} from '../../../actions/context/resolveOrganizationId.js'

export class GetMcpEndpointCommand extends SanityCommand<typeof GetMcpEndpointCommand> {
  static override args = {
    name: mcpEndpointNameArg,
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
    ...mcpEndpointOrganizationFlag,
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {name} = this.args
    const {json, organization} = this.flags

    const organizationId = await resolveOrganizationId({
      configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
      flagOrganizationId: organization,
      unattended: this.isUnattended(),
    })

    const endpoint = await findMcpEndpoint(organizationId, name)

    if (json) {
      this.logJson(endpoint)
      return
    }

    for (const line of formatMcpEndpoint(endpoint)) {
      this.log(line)
    }
  }
}
