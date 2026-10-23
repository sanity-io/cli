import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {colorizeJson, exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {isRecord} from '@sanity/cli-core/util'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../actions/context/resolveOrganizationId.js'
import {queryContext} from '../../services/context.js'
import {getOrganizationFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const queryContextDebug = subdebug('context:query')

const flags = {
  ...getOrganizationFlag({
    description: 'Organization to query',
    semantics: 'override',
  }),
  params: Flags.custom<Record<string, unknown>>({
    description: 'Query parameters as a JSON object',
    helpValue: '<json>',
    parse: async (input: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(input)
      } catch {
        throw new Error('`--params` must be valid JSON')
      }
      if (!isRecord(parsed)) {
        throw new Error('`--params` must be a JSON object, like \'{"type": "issue"}\'')
      }
      return parsed
    },
  })(),
} satisfies FlagInput

export class QueryContextCommand extends SanityCommand<typeof QueryContextCommand> {
  static override args = {
    query: Args.string({
      description: "GROQ query to run against the organization's Context documents",
      required: true,
    }),
  }

  static override description = "Query an organization's Context documents with GROQ"

  static override enableJsonFlag = true

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> \'*[_type == "sanity.context.issue" && status == "open"]{_id, knowledgeBaseId}\'',
      description: 'List open issues across all knowledge bases',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> \'*[_type == "sanity.context.entry" && knowledgeBaseId == $kb].path\' --params \'{"kb": "kb-abc123"}\' --json',
      description: 'List the entry paths of one knowledge base as plain JSON',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['params']})

  public async run(): Promise<void> {
    const {query} = this.args
    const {json, organization, params} = this.flags

    let organizationId: string
    try {
      organizationId = await resolveOrganizationId({
        configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
        flagOrganizationId: organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      queryContextDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    let result
    try {
      result = await queryContext(organizationId, query, params)
    } catch (error) {
      queryContextDebug('Error running query', error)
      this.error(`Failed to run query: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    // GROQ returns null for no match; guard undefined, which colorizeJson cannot tokenize
    const output = result ?? null
    if (json) {
      this.logJson(output)
      return
    }

    this.log(colorizeJson(output))
  }
}
