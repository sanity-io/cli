import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type Context, isHttpError} from '@sanity/client'

import {
  findMcpEndpoint,
  mcpEndpointNameArg,
  mcpEndpointOrganizationFlag,
} from '../../../actions/context/mcpEndpoint.js'
import {resolveOrganizationId} from '../../../actions/context/resolveOrganizationId.js'
import {formatKeyValue} from '../../../actions/debug/output.js'
import {getMcpEndpointStatus} from '../../../services/context.js'

const statusMcpDebug = subdebug('context:mcp:status')

export class McpEndpointStatusCommand extends SanityCommand<typeof McpEndpointStatusCommand> {
  static override args = {
    name: mcpEndpointNameArg,
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

    let status
    try {
      // The status route only takes names, not IDs
      status = await getMcpEndpointStatus(organizationId, endpoint.name)
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
    } else {
      this.printStatus(status)
    }

    // Like `sanity doctor`: fail when agents can't use the endpoint. Semantic search never affects `requiredOk`
    if (!status.requiredOk) this.exit(exitCodes.RUNTIME_ERROR)
  }

  private printStatus(status: Context.McpEndpointStatus): void {
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
    this.log(formatKeyValue('Semantic search', formatSemanticSearch(semanticSearch), {padTo}))
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

type SemanticSearchCheck = Context.McpEndpointStatus['checks']['semanticSearch']

const INACTIVE_REASONS = {
  datasetEmbeddingsNotReady: 'embeddings are still being prepared',
  turnedOff: 'turned off',
  usageLimitReached: 'embeddings usage limit reached',
} satisfies Record<NonNullable<Extract<SemanticSearchCheck, {ok: true}>['inactiveReason']>, string>

function formatSemanticSearch(check: SemanticSearchCheck): string {
  if (!check) return '-'
  if (!isPassed(check)) return `failed: ${check.error}`
  if (check.active) return 'active'
  return check.inactiveReason ? `inactive (${INACTIVE_REASONS[check.inactiveReason]})` : 'inactive'
}
