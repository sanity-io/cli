import {Args} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isHttpError} from '@sanity/client'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../../actions/context/resolveOrganizationId.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getMcpEndpointStatus} from '../../../services/context.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'

const statusMcpDebug = subdebug('context:mcp:status')

export class McpEndpointStatusCommand extends SanityCommand<typeof McpEndpointStatusCommand> {
  static override args = {
    name: Args.string({
      description: 'MCP endpoint name, as in its URL',
      required: true,
    }),
  }

  static override description =
    'Check whether an agent connecting with your credentials can use a Context MCP endpoint'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> support',
      description: 'Check the "support" MCP endpoint',
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
      statusMcpDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    let status
    try {
      status = await getMcpEndpointStatus(organizationId, name)
    } catch (error) {
      statusMcpDebug('Error checking MCP endpoint', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`MCP endpoint "${name}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Failed to check MCP endpoint: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    if (json) {
      this.logJson(status)
      return
    }

    const {knowledgeBases, schema, semanticSearch, studio} = status.checks
    const padTo = 15 // "Knowledge bases" and "Semantic search" are the longest keys
    this.log(
      formatKeyValue(
        'Studio',
        formatCheck(studio, (check) => `workspace "${check.workspace}"`),
        {padTo},
      ),
    )
    this.log(
      formatKeyValue(
        'Schema',
        formatCheck(
          schema,
          (check) => `${check.documentTypes} document types, ${check.perspective} perspective`,
        ),
        {padTo},
      ),
    )
    this.log(
      formatKeyValue(
        'Knowledge bases',
        formatCheck(knowledgeBases, (check) => check.resolved.join(', ')),
        {padTo},
      ),
    )
    this.log(
      formatKeyValue(
        'Semantic search',
        formatCheck(semanticSearch, (check) =>
          check.active ? 'active' : `inactive: ${check.inactiveReason}`,
        ),
        {padTo},
      ),
    )
    this.log(formatKeyValue('Ready', status.requiredOk ? 'yes' : 'no', {padTo}))
  }
}

/**
 * A check is `null` when it doesn't apply to the endpoint
 */
function formatCheck<Check extends {error?: string; ok: boolean}>(
  check: Check | null,
  describe: (check: Extract<Check, {ok: true}>) => string,
): string {
  if (!check) return '-'
  return isPassed(check) ? `ok (${describe(check)})` : `failed: ${check.error}`
}

function isPassed<Check extends {ok: boolean}>(check: Check): check is Extract<Check, {ok: true}> {
  return check.ok
}
