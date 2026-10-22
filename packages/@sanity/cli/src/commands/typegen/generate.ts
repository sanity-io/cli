import {stat} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes, SanityCommand} from '@sanity/cli-core'
import {spinner, type SpinnerInstance} from '@sanity/cli-core/ux'
import {
  generateGroqDeclarations,
  type GroqDeclaration,
  readConfig,
  runTypegenGenerate,
  runTypegenWatcher,
  type TypeGenConfig,
  type TypegenProgressEvent,
  TypegenWatchModeTrace,
  TypesGeneratedTrace,
} from '@sanity/codegen'
import omit from 'lodash-es/omit.js'
import once from 'lodash-es/once.js'

import {count} from '../../actions/typegen/count.js'
import {formatPath} from '../../actions/typegen/formatPath.js'
import {
  generateResourceTypes,
  type ResolvedResource,
  resolveResourceSchemas,
} from '../../actions/typegen/generateResourceTypes.js'
import {
  createGroqDeclarationsRunner,
  groqDeclarationOptions,
  planResourceGroqDeclarations,
  type ResourceGroqDeclarationsPlan,
} from '../../actions/typegen/groqDeclarations.js'
import {parseTypegenConfig} from '../../actions/typegen/parseTypegenConfig.js'
import {
  parseTypegenResources,
  type TypegenResourcesConfig,
} from '../../actions/typegen/parseTypegenResources.js'
import {createTypegenProgressRenderer} from '../../actions/typegen/renderTypegenProgress.js'
import {
  type ResourceTypesWatcher,
  watchResourceTypes,
} from '../../actions/typegen/watchResourceTypes.js'
import {toForwardSlashes} from '../../util/toForwardSlashes.js'

const description = `Sanity TypeGen

${styleText('bold', 'Configuration:')}
This command can utilize configuration settings defined in a \`sanity-typegen.json\` file. These settings include:

- "path": Specifies a glob pattern to locate your TypeScript or JavaScript files.
  Default: "./src/**/*.{ts,tsx,js,jsx}"

- "schema": Defines the path to your Sanity schema file. This file should be generated using the \`sanity schema extract\` command.
  Default: "schema.json"

- "generates": Indicates the path where the generated TypeScript type definitions will be saved.
  Default: "./sanity.types.ts"

The default configuration values listed above are used if not overridden in your \`sanity-typegen.json\` configuration file. To customize the behavior of the type generation, adjust these properties in the configuration file according to your project's needs.

${styleText('bold', '.groq files (beta):')}
A query can also live in its own \`.groq\` file and be imported as a typed query: \`import postsQuery, {type QueryResponse} from './posts.groq'\`. The command writes a \`.d.groq.ts\` next to every \`.groq\` file in the folders \`path\` reads from, which TypeScript resolves with \`allowArbitraryExtensions\`, and \`--watch\` keeps them up to date. With \`typegen.resources\`, each resource types the \`.groq\` files in its own folders against its \`schema\` file; a resource without \`schema\` does not type them yet.

${styleText('bold', 'Note:')}
- The \`sanity schema extract\` command is a prerequisite for extracting your Sanity Studio schema into a \`schema.json\` file, which is then used by the \`sanity typegen generate\` command to generate type definitions.
- To generate types for several datasets, list them in \`typegen.resources\` in \`sanity.cli.ts\` (beta). Each resource uses its own \`schema\` file, or the schema bound to its dataset when \`schema\` is omitted. With \`--watch\`, a schema bound to a dataset is fetched once, when the watcher starts. Restart it after deploying a schema.`.trim()

export class TypegenGenerateCommand extends SanityCommand<typeof TypegenGenerateCommand> {
  static override description = description

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: `Generate TypeScript type definitions from a Sanity Studio schema extracted using the \`sanity schema extract\` command.`,
    },
  ]

  static override flags = {
    'config-path': Flags.string({
      description:
        '[Default: sanity-typegen.json] Specifies the path to the typegen configuration file. This file should be a JSON file that contains settings for the type generation process.',
    }),
    watch: Flags.boolean({
      default: false,
      description: '[Default: false] Run the typegen in watch mode',
    }),
  }

  static override hiddenAliases: string[] = ['typegen:generate']

  public async run(): Promise<void> {
    const {flags} = await this.parse(TypegenGenerateCommand)

    if (flags.watch) {
      await this.runWatcher()
      return
    }

    await this.runSingle()
  }

  /**
   * Writes a `.d.groq.ts` next to every `.groq` file in the query folders, after the usual
   * types. Prints nothing when there is none, so a project without `.groq` files sees no change.
   */
  private async generateResourceGroqDeclarations(
    plan: ResourceGroqDeclarationsPlan,
    spin: SpinnerInstance,
    workDir: string,
  ): Promise<void> {
    for (const warning of plan.warnings) {
      this.output.warn(warning)
    }
    if (!plan.options) return
    reportGroqDeclarations(spin, await generateGroqDeclarations(plan.options), workDir)
  }

  private async getConfig(): Promise<{
    config: TypeGenConfig
    path?: string
    resources?: TypegenResourcesConfig
    type: 'cli' | 'legacy'
    workDir: string
  }> {
    const spin = spinner({}).start('Loading config…')

    try {
      const {flags} = await this.parse(TypegenGenerateCommand)
      const rootDir = await this.getProjectRoot()
      const config = await this.getCliConfig()

      const configPath = flags['config-path']
      const workDir = rootDir.directory

      const legacyConfigPath = configPath || 'sanity-typegen.json'
      let hasLegacyConfig = false

      try {
        const file = await stat(legacyConfigPath)
        hasLegacyConfig = file.isFile()
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT' && configPath) {
          spin.fail()
          this.error(`Typegen config file not found: ${configPath}`, {
            exit: exitCodes.RUNTIME_ERROR,
          })
        }

        if (err instanceof Error && 'code' in err && err.code !== 'ENOENT') {
          spin.fail()
          this.error(`Error when checking if typegen config file exists: ${legacyConfigPath}`, {
            exit: exitCodes.RUNTIME_ERROR,
          })
        }
      }

      if (config?.typegen && hasLegacyConfig) {
        spin.warn(
          styleText(
            'yellow',
            `You've specified typegen in your Sanity CLI config, but also have a typegen config.

    The config from the Sanity CLI config is used.
    `,
          ),
        )

        const resources = parseTypegenResources(config.typegen, workDir)
        return {
          config: resources?.config ?? parseTypegenConfig(config.typegen || {}),
          path: rootDir.path,
          resources,
          type: 'cli',
          workDir,
        }
      }

      if (hasLegacyConfig) {
        spin.warn(
          styleText(
            'yellow',
            `The separate typegen config has been deprecated. Use \`typegen\` in the sanity CLI config instead.

    See: https://www.sanity.io/docs/help/configuring-typegen-in-sanity-cli-config`,
          ),
        )
        return {
          config: await readConfig(legacyConfigPath),
          path: legacyConfigPath,
          type: 'legacy',
          workDir,
        }
      }

      const resources = parseTypegenResources(config.typegen, workDir)
      spin.succeed(`Config loaded from sanity.cli.ts`)

      return {
        config: resources?.config ?? parseTypegenConfig(config.typegen || {}),
        path: rootDir.path,
        resources,
        type: 'cli',
        workDir,
      }
    } catch (err) {
      // The config-file checks above already reported a user-facing error via
      // `this.error()` (an oclif CLIError). Re-throw those as-is instead of
      // wrapping them a second time and failing the spinner twice.
      if (err instanceof CLIError) throw err
      spin.fail()
      this.error(`An error occurred during config loading: ${err}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  /**
   * Prints the resources' configuration warnings, then locates every resource's schema, reporting
   * each one on the spinner.
   */
  private async resolveResources(
    resources: TypegenResourcesConfig,
    spin: SpinnerInstance,
    workDir: string,
    {checkSchemaFiles}: {checkSchemaFiles: boolean},
  ): Promise<ResolvedResource[]> {
    for (const warning of resources.warnings) {
      this.output.warn(warning)
    }

    return resolveResourceSchemas({
      checkSchemaFiles,
      onResolved: (entry) => {
        spin.succeed(
          'schemaPath' in entry
            ? `Using ${formatPath(entry.schemaPath)} for ${entry.key}`
            : `Fetched the schema bound to ${entry.key} (${entry.schemaVersion})`,
        )
      },
      onResolving: (resource, key) => {
        spin.start(
          resource.schema === undefined
            ? `Fetching the schema bound to ${key}…`
            : `Checking the schema file for ${key}…`,
        )
      },
      resources: resources.resources,
      workDir,
    })
  }

  private async runSingle(): Promise<void> {
    const trace = this.telemetry.trace(TypesGeneratedTrace)
    let spin: SpinnerInstance | undefined

    try {
      const {
        config: typegenConfig,
        resources,
        type: typegenConfigMethod,
        workDir,
      } = await this.getConfig()
      trace.start()

      if (resources) {
        const resourceSpin = spinner({})
        spin = resourceSpin
        const resolved = await this.resolveResources(resources, resourceSpin, workDir, {
          checkSchemaFiles: true,
        })

        const results = await generateResourceTypes({
          config: typegenConfig,
          onProgress: createResourceProgressHandler(resourceSpin, typegenConfig),
          resolved,
          workDir,
        })

        for (const {result} of results) {
          trace.log({
            configMethod: typegenConfigMethod,
            configOverloadClientMethods: typegenConfig.overloadClientMethods,
            ...omit(result, 'code', 'duration'),
          })
        }

        await this.generateResourceGroqDeclarations(
          await planResourceGroqDeclarations({config: typegenConfig, resolved, workDir}),
          resourceSpin,
          workDir,
        )
        trace.complete()
        return
      }

      spin = spinner({}).start('Loading schema…')
      const result = await runTypegenGenerate({
        config: typegenConfig,
        onProgress: createTypegenProgressRenderer(spin, {
          formatGeneratedCode: typegenConfig.formatGeneratedCode,
          generates: typegenConfig.generates,
          schema: typegenConfig.schema,
        }),
        workDir,
      })

      const traceStats = omit(result, 'code', 'duration')

      trace.log({
        configMethod: typegenConfigMethod,
        configOverloadClientMethods: typegenConfig.overloadClientMethods,
        ...traceStats,
      })

      reportGroqDeclarations(
        spin,
        await generateGroqDeclarations(groqDeclarationOptions(typegenConfig, workDir)),
        workDir,
      )
      trace.complete()
    } catch (error) {
      if (spin?.isSpinning) {
        spin.fail()
      }
      trace.error(error instanceof Error ? error : new Error(String(error)))
      this.error(`${error instanceof Error ? error.message : 'Unknown error'}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  private async runWatcher(): Promise<void> {
    const trace = this.telemetry.trace(TypegenWatchModeTrace)
    let spin: SpinnerInstance | undefined

    try {
      const {config: typegenConfig, resources, workDir} = await this.getConfig()
      trace.start()

      let resolve: () => void = () => {}
      const promise = new Promise<void>((res) => {
        resolve = res
      })

      const watchSpin = spinner({})
      spin = watchSpin
      const typegenWatcher = resources
        ? await this.startResourceWatcher(typegenConfig, resources, watchSpin, workDir)
        : this.startSchemaWatcher(typegenConfig, watchSpin, workDir)

      const stop = once(async () => {
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)

        if (watchSpin.isSpinning) {
          watchSpin.stop()
        }

        trace.log({
          step: 'stopped',
          ...typegenWatcher.getStats(),
        })
        trace.complete()

        try {
          await typegenWatcher.stop()
        } catch {
          // We're shutting down; a failure to close the watcher shouldn't hang
          // the process or surface as an unhandled rejection.
        }
        resolve()
      })

      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)

      await promise
    } catch (error) {
      if (spin?.isSpinning) {
        spin.fail()
      }
      trace.error(error instanceof Error ? error : new Error(String(error)))
      // Errors already reported with `this.error()` keep their own exit code.
      if (error instanceof CLIError) throw error
      this.error(`${error instanceof Error ? error.message : 'Unknown error'}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }

  /**
   * Locates every resource's schema once, then generates on each query or local schema change.
   * A schema bound to a dataset is fetched only here, so a schema deployed while the watcher runs
   * is used after a restart.
   */
  private async startResourceWatcher(
    config: TypeGenConfig,
    resources: TypegenResourcesConfig,
    spin: SpinnerInstance,
    workDir: string,
  ): Promise<ResourceTypesWatcher> {
    // A missing local schema file fails that resource's generation until the file appears,
    // instead of ending the watcher.
    const resolved = await this.resolveResources(resources, spin, workDir, {
      checkSchemaFiles: false,
    })
    const groqDeclarations = await planResourceGroqDeclarations({config, resolved, workDir})
    for (const warning of groqDeclarations.warnings) {
      this.output.warn(warning)
    }

    return watchResourceTypes({
      config,
      groqDeclarations: groqDeclarations.options,
      onChange: (event, relativePath) => {
        this.output.log(`[${new Date().toLocaleTimeString()}] ${event}: ${relativePath}`)
      },
      onError: (error) => {
        spin.fail(error instanceof Error ? error.message : String(error))
      },
      onGroqDeclarations: (declarations) => {
        reportGroqDeclarations(spin, declarations, workDir)
      },
      onProgress: createResourceProgressHandler(spin, config),
      resolved,
      workDir,
    })
  }

  /**
   * Starts codegen's watcher, which generates on each query file or schema change. The `.groq`
   * declarations are written after each generation, and the `.groq` files are added to what the
   * watcher watches, so editing one generates as well. The declarations are taken out of it: they
   * end in `.ts`, so the query patterns match them, and writing one would start another run.
   */
  private startSchemaWatcher(
    config: TypeGenConfig,
    spin: SpinnerInstance,
    workDir: string,
  ): ReturnType<typeof runTypegenWatcher> {
    spin.start('Loading schema…')
    const rendererContext = {
      formatGeneratedCode: config.formatGeneratedCode,
      generates: config.generates,
      schema: config.schema,
    }
    let renderProgress = createTypegenProgressRenderer(spin, rendererContext)

    const groqDeclarations = groqDeclarationOptions(config, workDir)
    const generateDeclarations = createGroqDeclarationsRunner({
      onError: (error) => {
        spin.fail(error instanceof Error ? error.message : String(error))
      },
      onGenerated: (declarations) => {
        reportGroqDeclarations(spin, declarations, workDir)
      },
      options: groqDeclarations,
    })

    const typegenWatcher = runTypegenWatcher({
      config,
      onProgress: (event) => {
        // 'schemaLoaded' is the first event of every generation cycle; the
        // renderer accumulates per-run state, so start each cycle fresh.
        if (event.type === 'schemaLoaded') {
          renderProgress = createTypegenProgressRenderer(spin, rendererContext)
        }
        renderProgress(event)
        if (event.type === 'complete') {
          void generateDeclarations()
        }
      },
      workDir,
    })
    const {watcher} = typegenWatcher
    watcher.add(groqDeclarations.path.map((pattern) => toForwardSlashes(join(workDir, pattern))))
    // chokidar ignores an unwatched glob from then on.
    watcher.unwatch(toForwardSlashes(join(workDir, '**/*.d.groq.ts')))
    return typegenWatcher
  }
}

/**
 * Reports a problem in each `.groq` file that has one, then how many files were typed. A file
 * with a problem still gets a complete declaration, so this is a warning rather than a failure.
 */
function reportGroqDeclarations(
  spin: SpinnerInstance,
  declarations: GroqDeclaration[],
  workDir: string,
): void {
  for (const {diagnostics, file} of declarations) {
    for (const {messageText} of diagnostics) {
      spin.warn(`${formatPath(relative(workDir, file))}: ${messageText}`)
    }
  }
  if (declarations.length > 0) {
    spin.succeed(
      `Generated declarations for ${count(declarations.length, '.groq files', '.groq file')}`,
    )
  }
}

/**
 * Returns the progress handler for one resource's generation, which starts with a line naming
 * the resource. The renderer keeps per-run state, so each generation gets a new one.
 */
function createResourceProgressHandler(
  spin: SpinnerInstance,
  config: TypeGenConfig,
): (entry: ResolvedResource) => (event: TypegenProgressEvent) => void {
  return (entry) => {
    spin.start(`Generating types for ${entry.key}…`)
    return createTypegenProgressRenderer(spin, {
      formatGeneratedCode: config.formatGeneratedCode,
      generates: entry.resource.generates,
      schema: 'schemaPath' in entry ? entry.schemaPath : entry.key,
    })
  }
}
