import path from 'node:path'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {chalk, confirm, spinner} from '@sanity/cli-core/ux'
import {
  APIConfig,
  DEFAULT_MUTATION_CONCURRENCY,
  dryRun,
  MAX_MUTATION_CONCURRENCY,
  type Migration,
  type MigrationProgress,
  run,
} from '@sanity/migrate'
import {Table} from 'console-table-printer'

import {getMigrationRootDirectory} from '../../actions/migration/getMigrationRootDirectory.js'
import {resolveMigrations} from '../../actions/migration/resolveMigrations.js'
import {DEFAULT_API_VERSION, MIGRATIONS_DIRECTORY} from '../../util/migration/constants.js'
import {ensureApiVersionFormat} from '../../util/migration/ensureApiVersionFormat.js'
import {prettyFormat} from '../../util/migration/prettyMutationFormatter.js'
import {
  isLoadableMigrationScript,
  resolveMigrationScript,
} from '../../utils/migration/resolveMigrationScript.js'

const runMigrationDebug = subdebug('migration:run')

export type RunMigrationFlags = RunMigrationCommand['flags']

export class RunMigrationCommand extends SanityCommand<typeof RunMigrationCommand> {
  static override args = {
    id: Args.string({
      description: 'ID',
      required: false,
    }),
  }

  static override description = 'Run a migration against a dataset'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> <id>',
      description: 'dry run the migration',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> <id> --no-dry-run --project xyz --dataset staging',
      description: 'execute the migration against a dataset',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> <id> --from-export=production.tar.gz --no-dry-run --project xyz --dataset staging',
      description: 'execute the migration using a dataset export as the source',
    },
  ]

  static override flags = {
    'api-version': Flags.string({
      description: `API version to use when migrating. Defaults to ${DEFAULT_API_VERSION}.`,
    }),
    concurrency: Flags.integer({
      default: DEFAULT_MUTATION_CONCURRENCY,
      description: `How many mutation requests to run in parallel. Must be between 1 and ${MAX_MUTATION_CONCURRENCY}. Default: ${DEFAULT_MUTATION_CONCURRENCY}.`,
    }),
    confirm: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Prompt for confirmation before running the migration (default: true). Use --no-confirm to skip.',
    }),
    dataset: Flags.string({
      description:
        'Dataset to migrate. Defaults to the dataset configured in your Sanity CLI config.',
    }),
    'dry-run': Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'By default the migration runs in dry mode. Use --no-dry-run to migrate dataset.',
    }),
    'from-export': Flags.string({
      description:
        'Use a local dataset export as source for migration instead of calling the Sanity API. Note: this is only supported for dry runs.',
    }),
    progress: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Display progress during migration (default: true). Use --no-progress to hide output.',
    }),
    project: Flags.string({
      description:
        'Project ID of the dataset to migrate. Defaults to the projectId configured in your Sanity CLI config.',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(RunMigrationCommand)
    const cliConfig = await this.getCliConfig()
    const projectId = await this.getProjectId()
    const datasetFromConfig = cliConfig.api?.dataset

    const workDir = await getMigrationRootDirectory(this.output)
    const id = args.id
    const migrationsDirectoryPath = path.join(workDir, MIGRATIONS_DIRECTORY)

    const fromExport = flags['from-export']
    const dry = flags['dry-run']
    const dataset = flags.dataset
    const project = flags.project
    const apiVersion = ensureApiVersionFormat(flags['api-version'] ?? DEFAULT_API_VERSION)

    if ((dataset && !project) || (project && !dataset)) {
      this.error('If either --dataset or --project is provided, both must be provided', {exit: 1})
    }

    if (!project && !projectId) {
      this.error(
        'sanity.cli.js does not contain a project identifier ("api.projectId") and no --project option was provided.',
        {exit: 1},
      )
    }

    if (!dataset && !datasetFromConfig) {
      this.error(
        'sanity.cli.js does not contain a dataset identifier ("api.dataset") and no --dataset option was provided.',
        {exit: 1},
      )
    }

    if (!id) {
      this.warn(chalk.red('Error: Migration ID must be provided'))

      const migrations = await resolveMigrations(workDir)
      const table = new Table({
        columns: [
          {alignment: 'left', name: 'id', title: 'ID'},
          {alignment: 'left', name: 'title', title: 'Title'},
        ],
        title: `Migrations found in project`,
      })

      for (const definedMigration of migrations) {
        table.addRow({id: definedMigration.id, title: definedMigration.migration.title})
      }
      table.printTable()
      this.log('\nRun `sanity migration run <ID>` to run a migration')

      this.exit(1)
    }

    const candidates = await resolveMigrationScript(workDir, id)
    const resolvedScripts = candidates.filter((candidate) => isLoadableMigrationScript(candidate))

    if (resolvedScripts.length > 1) {
      // todo: consider prompt user about which one to run? note: it's likely a mistake if multiple files resolve to the same name
      this.error(
        `Found multiple migrations for "${id}" in ${chalk.cyan(migrationsDirectoryPath)}: \n - ${candidates
          .map((candidate) => path.relative(migrationsDirectoryPath, candidate.absolutePath))
          .join('\n - ')}`,
        {exit: 1},
      )
    }

    const script = resolvedScripts[0]
    if (!script) {
      this.error(
        `No migration found for "${id}" in ${chalk.cyan(chalk.cyan(migrationsDirectoryPath))}. Make sure that the migration file exists and exports a valid migration as its default export.\n
 Tried the following files:\n - ${candidates
   .map((candidate) => path.relative(migrationsDirectoryPath, candidate.absolutePath))
   .join('\n - ')}`,
        {exit: 1},
      )
    }

    const mod = script.mod
    if ('up' in mod || 'down' in mod) {
      // todo: consider adding support for up/down as separate named exports
      // For now, make sure we reserve the names for future use
      this.error('Only "up" migrations are supported at this time, please use a default export', {
        exit: 1,
      })
    }

    const migration: Migration = mod.default

    if (fromExport && !dry) {
      this.error('Can only dry run migrations from a dataset export file', {exit: 1})
    }

    const concurrency = flags.concurrency
    if (concurrency !== undefined) {
      if (concurrency > MAX_MUTATION_CONCURRENCY) {
        this.error(`Concurrency exceeds the maximum allowed value of ${MAX_MUTATION_CONCURRENCY}`, {
          exit: 1,
        })
      }

      if (concurrency < 1) {
        this.error(`Concurrency must be a positive number, got ${concurrency}`, {exit: 1})
      }
    }

    const projectClient = await this.getProjectApiClient({
      apiVersion: apiVersion,
      projectId: (project ?? projectId)!,
      requireUser: true,
    })
    const projectConfig = projectClient.config()

    const apiConfig: APIConfig = {
      apiHost: projectConfig.apiHost,
      apiVersion: apiVersion,
      dataset: (dataset ?? datasetFromConfig)!,
      projectId: (project ?? projectId)!,
      token: projectConfig.token!,
    } as const
    if (dry) {
      this.dryRunHandler(id, migration, apiConfig, fromExport)
      return
    }

    this.log(`\n${chalk.yellow(chalk.bold('Note: During migrations, your webhooks stay active.'))}`)
    this.log(
      `To adjust them, launch the management interface with ${chalk.cyan('sanity manage')}, navigate to the API settings, and toggle the webhooks before and after the migration as needed.\n`,
    )

    if (flags.confirm) {
      await this.promptConfirmMigrate(apiConfig)
    }

    const spin = spinner(`Running migration "${id}"`).start()
    await run(
      {
        api: apiConfig,
        concurrency,
        onProgress: this.createProgress(spin, flags, id, dry, apiConfig, migration),
      },
      migration,
    )
    spin.stop()
  }

  private createProgress(
    progressSpinner: ReturnType<typeof spinner>,
    flags: RunMigrationFlags,
    id: string,
    dry: boolean,
    apiConfig: APIConfig,
    migration: Migration,
  ) {
    return function onProgress(progress: MigrationProgress) {
      if (!flags.progress) {
        progressSpinner.stop()
        return
      }
      if (progress.done) {
        progressSpinner.text = `Migration "${id}" completed.

  Project id:  ${chalk.bold(apiConfig.projectId)}
  Dataset:     ${chalk.bold(apiConfig.dataset)}

  ${progress.documents} documents processed.
  ${progress.mutations} mutations generated.
  ${chalk.green(progress.completedTransactions.length)} transactions committed.`
        progressSpinner.stopAndPersist({symbol: chalk.green('✔')})
        return
      }

      for (const transaction of [null, ...progress.currentTransactions]) {
        progressSpinner.text = `Running migration "${id}" ${dry ? 'in dry mode...' : '...'}

  Project id:     ${chalk.bold(apiConfig.projectId)}
  Dataset:        ${chalk.bold(apiConfig.dataset)}
  Document type:  ${chalk.bold(migration.documentTypes?.join(','))}

  ${progress.documents} documents processed…
  ${progress.mutations} mutations generated…
  ${chalk.blue(progress.pending)} requests pending…
  ${chalk.green(progress.completedTransactions.length)} transactions committed.

  ${
    transaction && !progress.done
      ? `» ${prettyFormat({indentSize: 2, migration, subject: transaction})}`
      : ''
  }`
      }
    }
  }

  private async dryRunHandler(
    id: string,
    migration: Migration,
    apiConfig: APIConfig,
    fromExport: string | undefined,
  ) {
    this.log(`Running migration "${id}" in dry mode`)

    if (fromExport) {
      this.log(`Using export ${chalk.cyan(fromExport)}`)
    }

    this.log()
    this.log(`Project id:  ${chalk.bold(apiConfig.projectId)}`)
    this.log(`Dataset:     ${chalk.bold(apiConfig.dataset)}`)

    for await (const mutation of dryRun({api: apiConfig, exportPath: fromExport}, migration)) {
      if (!mutation) continue
      this.log()
      this.log(
        prettyFormat({
          migration,
          subject: mutation,
        }),
      )
    }
  }

  private async promptConfirmMigrate(apiConfig: APIConfig) {
    const response = await confirm({
      message: `This migration will run on the ${chalk.yellow(
        chalk.bold(apiConfig.dataset),
      )} dataset in ${chalk.yellow(chalk.bold(apiConfig.projectId))} project. Are you sure?`,
    })

    if (!response) {
      runMigrationDebug('User aborted migration')
      this.exit(1)
    }
  }
}
