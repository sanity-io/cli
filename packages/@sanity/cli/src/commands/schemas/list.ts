import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {isProjectRootNotFoundError} from '@sanity/cli-core/errors'

import {listSchemas} from '../../actions/schema/listSchemas.js'
import {schemasListDebug} from '../../actions/schema/utils/debug.js'
import {parseWorkspaceSchemaId} from '../../actions/schema/utils/schemaStoreValidation.js'
import {getBlueprintCliContext} from '../../util/blueprintCliContext.js'
import {getDatasetFlag, getProjectIdFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const description = `
List all schemas in the current dataset.

Note: This command is experimental and subject to change.

Regenerates a manifest file by default. To reuse an existing manifest, use --no-extract-manifest.
`.trim()

export class ListSchemaCommand extends SanityCommand<typeof ListSchemaCommand> {
  static override description = description

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all schemas found in any workspace dataset in a table',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --id _.schemas.workspaceName',
      description: 'Get a schema for a given id',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'Get stored schemas as pretty-printed json-array',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json --id _.schemas.workspaceName',
      description: 'Get singular stored schema as pretty-printed json-object',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({description: 'Project ID to list schemas for', semantics: 'specify'}),
    ...getDatasetFlag({description: 'Dataset to list schemas for', semantics: 'specify'}),
    'extract-manifest': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Regenerate manifest before listing (use --no-extract-manifest to skip)',
      hidden: true,
    }),
    id: Flags.string({
      description: 'Fetch a single schema by id',
      helpValue: '<schema_id>',
    }),
    'manifest-dir': Flags.directory({
      default: './dist/static',
      description: 'Directory containing manifest file',
      helpValue: '<directory>',
      hidden: true,
    }),
  }

  static override hiddenAliases: string[] = ['schema:list']

  static telemetry = defineCommandTelemetry(this.flags, {redact: ['manifest-dir']})

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListSchemaCommand)
    const errors: string[] = []
    const id = parseWorkspaceSchemaId(errors, flags.id)?.schemaId
    if (errors.length > 0) {
      this.error(`Invalid arguments:\n${errors.map((error) => `  - ${error}`).join('\n')}`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    try {
      const source = await this.getSchemaSource(flags.project, flags.dataset)

      await listSchemas({
        ...source,
        id,
        json: !!flags.json,
        output: this.output,
      })
    } catch (error) {
      schemasListDebug('Failed to list schemas', error)

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.error(`Failed to list schemas:\n${errorMessage}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private async getSchemaSource(projectFlag: string | undefined, datasetFlag: string | undefined) {
    if (projectFlag && datasetFlag) return {dataset: {dataset: datasetFlag, projectId: projectFlag}}
    if (!projectFlag && !datasetFlag) {
      try {
        const projectRoot = await this.getProjectRoot()
        return {configPath: projectRoot.path, workDir: projectRoot.directory}
      } catch (error) {
        if (!isProjectRootNotFoundError(error)) throw error
        const workspace = await getBlueprintCliContext()
        if (!workspace) throw error
        if (workspace.projectId && workspace.dataset) {
          return {dataset: {dataset: workspace.dataset, projectId: workspace.projectId}}
        }
      }
    }
    const workspace = await getBlueprintCliContext()
    const projectId = projectFlag || workspace?.projectId
    const dataset =
      datasetFlag || (workspace?.projectId === projectId ? workspace?.dataset : undefined)
    if (projectId && dataset) return {dataset: {dataset, projectId}}
    throw new Error(
      'Pass both `--project <id>` and `--dataset <name>` to list schemas for a dataset.',
    )
  }
}
