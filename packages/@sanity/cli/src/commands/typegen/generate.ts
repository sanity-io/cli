import {stat} from 'node:fs/promises'
import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {SanityCommand} from '@sanity/cli-core'
import {spinner, type SpinnerInstance} from '@sanity/cli-core/ux'
import {
  configDefinition,
  readConfig,
  runTypegenGenerate,
  runTypegenWatcher,
  type TypeGenConfig,
  TypegenWatchModeTrace,
  TypesGeneratedTrace,
} from '@sanity/codegen'
import omit from 'lodash-es/omit.js'
import once from 'lodash-es/once.js'

import {createTypegenProgressRenderer} from '../../actions/typegen/renderTypegenProgress.js'

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

${styleText('bold', 'Note:')}
- The \`sanity schema extract\` command is a prerequisite for extracting your Sanity Studio schema into a \`schema.json\` file, which is then used by the \`sanity typegen generate\` command to generate type definitions.`.trim()

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

  private async getConfig(): Promise<{
    config: TypeGenConfig
    path?: string
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
          this.error(`Typegen config file not found: ${configPath}`, {exit: 1})
        }

        if (err instanceof Error && 'code' in err && err.code !== 'ENOENT') {
          spin.fail()
          this.error(`Error when checking if typegen config file exists: ${legacyConfigPath}`, {
            exit: 1,
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

        return {
          config: configDefinition.parse(config.typegen || {}),
          path: rootDir.path,
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

      spin.succeed(`Config loaded from sanity.cli.ts`)

      return {
        config: configDefinition.parse(config.typegen || {}),
        path: rootDir.path,
        type: 'cli',
        workDir,
      }
    } catch (err) {
      // The config-file checks above already reported a user-facing error via
      // `this.error()` (an oclif CLIError). Re-throw those as-is instead of
      // wrapping them a second time and failing the spinner twice.
      if (err instanceof CLIError) throw err
      spin.fail()
      this.error(`An error occurred during config loading: ${err}`, {exit: 1})
    }
  }

  private async runSingle(): Promise<void> {
    const trace = this.telemetry.trace(TypesGeneratedTrace)
    let spin: SpinnerInstance | undefined

    try {
      const {config: typegenConfig, type: typegenConfigMethod, workDir} = await this.getConfig()
      trace.start()

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
      trace.complete()
    } catch (error) {
      if (spin?.isSpinning) {
        spin.fail()
      }
      trace.error(error instanceof Error ? error : new Error(String(error)))
      this.error(`${error instanceof Error ? error.message : 'Unknown error'}`, {exit: 1})
    }
  }

  private async runWatcher(): Promise<void> {
    const trace = this.telemetry.trace(TypegenWatchModeTrace)
    let spin: SpinnerInstance | undefined

    try {
      const {config: typegenConfig, workDir} = await this.getConfig()
      trace.start()

      let resolve: () => void = () => {}
      const promise = new Promise<void>((res) => {
        resolve = res
      })

      const watchSpin = spinner({}).start('Loading schema…')
      spin = watchSpin
      const rendererContext = {
        formatGeneratedCode: typegenConfig.formatGeneratedCode,
        generates: typegenConfig.generates,
        schema: typegenConfig.schema,
      }
      let renderProgress = createTypegenProgressRenderer(watchSpin, rendererContext)

      const typegenWatcher = runTypegenWatcher({
        config: typegenConfig,
        onProgress: (event) => {
          // 'schemaLoaded' is the first event of every generation cycle; the
          // renderer accumulates per-run state, so start each cycle fresh.
          if (event.type === 'schemaLoaded') {
            renderProgress = createTypegenProgressRenderer(watchSpin, rendererContext)
          }
          renderProgress(event)
        },
        workDir,
      })

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
      this.error(`${error instanceof Error ? error.message : 'Unknown error'}`, {exit: 1})
    }
  }
}
