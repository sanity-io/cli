import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {
  type DatasetSettings,
  datasetSourceId,
  editSources,
  findMcpEndpoint,
  formatMcpEndpoint,
  mcpEndpointNameArg,
  mcpEndpointOrganizationFlag,
  parseNonEmpty,
} from '../../../actions/context/mcpEndpoint.js'
import {resolveOrganizationId} from '../../../actions/context/resolveOrganizationId.js'
import {
  describeBlueprintManager,
  getMcpEndpointBlueprintOwnership,
  updateMcpEndpoint,
} from '../../../services/context.js'
import {getDatasetFlag, getProjectIdFlag} from '../../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const updateMcpDebug = subdebug('context:mcp:update')

const UPDATE_FLAGS = [
  'title',
  'add-knowledge-base',
  'remove-knowledge-base',
  'knowledge-base',
  'dataset',
  'no-dataset',
  'workspace',
  'perspective',
  'semantic-search',
  'instructions',
  'groq-filter',
]

const flags = {
  ...mcpEndpointOrganizationFlag,
  'add-knowledge-base': Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description: 'Knowledge base to add to the endpoint; repeat the flag to add several',
    helpValue: '<id>',
    multiple: true,
    parse: parseNonEmpty('add-knowledge-base'),
  }),
  ...getDatasetFlag({
    atLeastOne: UPDATE_FLAGS,
    description: 'Dataset the endpoint serves, replacing its current dataset',
    semantics: 'specify',
  }),
  ...getProjectIdFlag({
    dependsOn: ['dataset'],
    description: 'Project the dataset belongs to',
    semantics: 'override',
  }),
  'groq-filter': Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description:
      'GROQ filter that limits which dataset documents the endpoint serves ("" removes it)',
  }),
  instructions: Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description: 'Instructions the endpoint serves to connecting agents ("" removes them)',
  }),
  'knowledge-base': Flags.string({
    atLeastOne: UPDATE_FLAGS,
    hidden: true,
    multiple: true,
  }),
  'no-dataset': Flags.boolean({
    atLeastOne: UPDATE_FLAGS,
    description: 'Stop serving the dataset, which also removes the GROQ filter',
    exclusive: ['dataset'],
  }),
  perspective: Flags.custom<'drafts' | 'published' | 'raw'>({
    atLeastOne: UPDATE_FLAGS,
    description: 'Perspective agents query the dataset with',
    options: ['published', 'drafts', 'raw'],
  })(),
  'remove-knowledge-base': Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description: 'Knowledge base to remove from the endpoint; repeat the flag to remove several',
    helpValue: '<id>',
    multiple: true,
    parse: parseNonEmpty('remove-knowledge-base'),
  }),
  'semantic-search': Flags.boolean({
    allowNo: true,
    atLeastOne: UPDATE_FLAGS,
    description:
      'Let agents use semantic search on the dataset (--no-semantic-search to turn it off)',
  }),
  title: Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description: 'New MCP endpoint title',
    parse: parseNonEmpty('title'),
  }),
  workspace: Flags.string({
    atLeastOne: UPDATE_FLAGS,
    description: 'Studio workspace whose schema agents use ("" goes back to the first workspace)',
  }),
} satisfies FlagInput

export class UpdateMcpEndpointCommand extends SanityCommand<typeof UpdateMcpEndpointCommand> {
  static override args = {
    name: mcpEndpointNameArg,
  }

  static override description = `Update a Context MCP endpoint

Only the settings you pass change. Dataset settings (--workspace, --perspective, --semantic-search) apply to the endpoint's dataset and start from the defaults when --dataset switches to another dataset.`

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> support --title "Customer support"',
      description: 'Rename an MCP endpoint',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> support --add-knowledge-base kb-def456 --remove-knowledge-base kb-abc123',
      description: 'Serve a different knowledge base',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> catalog --project abc123 --dataset staging --perspective drafts',
      description: 'Switch to another dataset and query its drafts',
    },
    {
      command: '<%= config.bin %> <%= command.id %> support --no-dataset',
      description: 'Stop serving the dataset',
    },
    {
      command: '<%= config.bin %> <%= command.id %> support --instructions ""',
      description: 'Remove the instructions',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['title', 'instructions', 'groq-filter'],
  })

  public async run(): Promise<void> {
    const {name} = this.args
    const {
      'add-knowledge-base': addKnowledgeBases = [],
      dataset,
      'groq-filter': groqFilter,
      instructions,
      'knowledge-base': knowledgeBase,
      'no-dataset': noDataset,
      organization,
      perspective,
      project,
      'remove-knowledge-base': removeKnowledgeBases = [],
      'semantic-search': semanticSearch,
      title,
      workspace,
    } = this.flags

    if (knowledgeBase !== undefined) {
      this.error(
        '`--knowledge-base` only works with `sanity context mcp create`. Use `--add-knowledge-base` or `--remove-knowledge-base` to change the knowledge bases of an endpoint.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (
      noDataset &&
      [groqFilter, perspective, semanticSearch, workspace].some((v) => v !== undefined)
    ) {
      this.error(
        '`--no-dataset` cannot be combined with `--groq-filter`, `--perspective`, `--semantic-search` or `--workspace`, which only apply to a dataset.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const addedAndRemoved = addKnowledgeBases.find((id) => removeKnowledgeBases.includes(id))
    if (addedAndRemoved) {
      this.error(
        `"${addedAndRemoved}" is passed to both \`--add-knowledge-base\` and \`--remove-knowledge-base\`.`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const cliConfig = await this.tryGetCliConfig()
    const datasetId = datasetSourceId(dataset, project ?? cliConfig.api?.projectId)

    const params: Context.EditMcpEndpointParams = {}
    if (title !== undefined) params.title = title
    if (instructions !== undefined) params.instructions = instructions.trim() || null
    if (groqFilter !== undefined) params.groqFilter = groqFilter.trim() || null

    const settings: DatasetSettings = {}
    if (workspace !== undefined) settings.workspace = workspace.trim() || null
    if (perspective !== undefined) settings.perspective = perspective
    if (semanticSearch !== undefined) settings.semanticSearch = semanticSearch
    const changesSources =
      addKnowledgeBases.length > 0 ||
      removeKnowledgeBases.length > 0 ||
      dataset !== undefined ||
      noDataset ||
      Object.keys(settings).length > 0
    const needsDataset = Object.keys(settings).length > 0 || Boolean(params.groqFilter)

    const organizationId = await resolveOrganizationId({
      configuredOrganizationId: cliConfig.app?.organizationId,
      flagOrganizationId: organization,
      unattended: this.isUnattended(),
    })

    const current = await findMcpEndpoint(organizationId, name)

    const ownership = await getMcpEndpointBlueprintOwnership(organizationId, current)
    if (ownership.managed) {
      const manager = describeBlueprintManager(ownership.stackName)
      this.error(
        `${manager} manages MCP endpoint "${name}", so the next deploy would undo this change. Change it in the blueprint and run \`sanity blueprints deploy\` instead.`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    if (changesSources || needsDataset) {
      const {notes, sources} = editSources(current.sources, {
        addKnowledgeBases,
        dataset: noDataset ? null : datasetId,
        removeKnowledgeBases,
        settings,
      })
      if (needsDataset && !sources.some((source) => source.type === 'dataset')) {
        this.error(`MCP endpoint "${name}" has no dataset source. Pass \`--dataset\` to add one.`, {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      if (sources.length === 0) {
        this.error('An MCP endpoint needs at least one knowledge base or dataset', {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      for (const note of notes) this.warn(note)
      if (changesSources) params.sources = sources
    }

    const spin = spinner('Updating MCP endpoint').start()
    try {
      const endpoint = await updateMcpEndpoint(organizationId, current.name, params)
      spin.succeed('MCP endpoint updated')
      for (const line of formatMcpEndpoint(endpoint)) {
        this.log(line)
      }
    } catch (error) {
      spin.fail()
      updateMcpDebug('Error updating MCP endpoint', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`MCP endpoint "${name}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }
      this.error(`Failed to update MCP endpoint: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
