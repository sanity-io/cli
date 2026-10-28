import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {spinner} from '@sanity/cli-core/ux'

import {
  editSources,
  formatMcpEndpoint,
  parseDatasetSourceId,
  parseNonEmpty,
} from '../../../actions/context/mcpEndpoint.js'
import {resolveOrganizationId} from '../../../actions/context/resolveOrganizationId.js'
import {promptForText} from '../../../prompts/promptForText.js'
import {createMcpEndpoint} from '../../../services/context.js'
import {getOrganizationFlag} from '../../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const createMcpDebug = subdebug('context:mcp:create')

const SOURCE_FLAGS = ['knowledge-base', 'dataset']

const flags = {
  ...getOrganizationFlag({
    description: 'Organization to create the MCP endpoint in',
    semantics: 'override',
  }),
  dataset: Flags.string({
    atLeastOne: SOURCE_FLAGS,
    description: 'Dataset the endpoint serves, as <projectId>.<datasetName>',
    helpValue: '<projectId.datasetName>',
    parse: parseDatasetSourceId,
  }),
  'groq-filter': Flags.string({
    dependsOn: ['dataset'],
    description: 'GROQ filter that limits which dataset documents the endpoint serves',
    parse: parseNonEmpty('groq-filter'),
  }),
  instructions: Flags.string({
    description: 'Instructions the endpoint serves to connecting agents',
    parse: parseNonEmpty('instructions'),
  }),
  'knowledge-base': Flags.string({
    atLeastOne: SOURCE_FLAGS,
    description: 'Knowledge base the endpoint serves; repeat the flag to serve several',
    helpValue: '<id>',
    multiple: true,
    parse: parseNonEmpty('knowledge-base'),
  }),
  perspective: Flags.custom<'drafts' | 'published' | 'raw'>({
    dependsOn: ['dataset'],
    description: 'Perspective agents query the dataset with',
    options: ['published', 'drafts', 'raw'],
  })(),
  'semantic-search': Flags.boolean({
    allowNo: true,
    dependsOn: ['dataset'],
    description:
      'Let agents use semantic search on the dataset (--no-semantic-search to turn it off)',
  }),
  title: requiredWhenUnattended(
    Flags.string({
      description: 'MCP endpoint title',
      parse: parseNonEmpty('title'),
    }),
  ),
  workspace: Flags.string({
    dependsOn: ['dataset'],
    description: 'Studio workspace whose schema agents use, instead of the first workspace',
    parse: parseNonEmpty('workspace'),
  }),
} satisfies FlagInput

export class CreateMcpEndpointCommand extends SanityCommand<typeof CreateMcpEndpointCommand> {
  static override args = {
    name: Args.string({
      description:
        'Permanent MCP endpoint name used in its URL, made of lowercase letters, digits and hyphens',
      required: true,
    }),
  }

  static override description =
    'Create a Context MCP endpoint that serves knowledge bases and a dataset to agents'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> support --title "Support" --knowledge-base kb-abc123 --knowledge-base kb-def456',
      description: 'Create an MCP endpoint that serves two knowledge bases',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> catalog --title "Catalog" --dataset abc123.production --perspective drafts --groq-filter \'_type in ["product"]\'',
      description: 'Create an MCP endpoint that serves the products in a dataset',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['title', 'instructions', 'groq-filter'],
  })

  public async run(): Promise<void> {
    const {name} = this.args
    const {
      dataset,
      'groq-filter': groqFilter,
      instructions,
      'knowledge-base': knowledgeBaseIds = [],
      organization,
      perspective,
      'semantic-search': semanticSearch,
      title: titleFlag,
      workspace,
    } = this.flags

    const organizationId = await resolveOrganizationId({
      configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
      flagOrganizationId: organization,
      unattended: this.isUnattended(),
    })

    const title = titleFlag || (await promptForText('MCP endpoint title:'))

    const spin = spinner('Creating MCP endpoint').start()
    try {
      const endpoint = await createMcpEndpoint(organizationId, {
        groqFilter,
        instructions,
        name,
        sources: editSources([], {
          addKnowledgeBases: knowledgeBaseIds,
          dataset,
          removeKnowledgeBases: [],
          settings: {perspective, semanticSearch, workspace},
        }).sources,
        title,
      })
      spin.succeed('MCP endpoint created')
      for (const line of formatMcpEndpoint(endpoint)) {
        this.log(line)
      }
    } catch (error) {
      spin.fail()
      createMcpDebug('Error creating MCP endpoint', error)
      this.error(`Failed to create MCP endpoint: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
