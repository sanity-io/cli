import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../../actions/context/resolveOrganizationId.js'
import {deleteMcpEndpoint, getMcpEndpointBlueprintOwnership} from '../../../services/context.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const deleteMcpDebug = subdebug('context:mcp:delete')

export class DeleteMcpEndpointCommand extends SanityCommand<typeof DeleteMcpEndpointCommand> {
  static override args = {
    name: Args.string({
      description: 'MCP endpoint name, as in its URL',
      required: true,
    }),
  }

  static override description =
    'Delete a Context MCP endpoint. Agents connected through it lose access'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> support',
      description: 'Delete an MCP endpoint after confirmation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> support --yes',
      description: 'Delete an MCP endpoint without confirmation prompt',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization the MCP endpoint belongs to',
      semantics: 'override',
    }),
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description: 'Skip confirmation prompt (unattended mode)',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {name} = this.args
    const {organization, yes: skipConfirmation} = this.flags

    let organizationId: string
    try {
      organizationId = await resolveOrganizationId({
        configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
        flagOrganizationId: organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      deleteMcpDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    const ownership = await getMcpEndpointBlueprintOwnership(organizationId, name)
    if (ownership.managed) {
      const manager = ownership.stackName
        ? `The blueprint stack "${ownership.stackName}"`
        : 'A blueprint'
      this.error(
        `${manager} manages MCP endpoint "${name}". To delete it, deploy it with \`lifecycle: {deletionPolicy: 'allow'}\` in the blueprint, then remove it from the blueprint and deploy again.`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (this.isUnattended() && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the MCP endpoint.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete MCP endpoint "${name}"? Agents connected through it lose access.`,
      })

      if (!confirmed) {
        this.log('MCP endpoint not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteMcpEndpoint(organizationId, name)
      this.log('MCP endpoint deleted')
    } catch (error) {
      deleteMcpDebug('Error deleting MCP endpoint', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`MCP endpoint "${name}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Failed to delete MCP endpoint: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
