import {access, mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {
  type CliConfig,
  exitCodes,
  ProjectRootNotFoundError,
  SanityCommand,
  subdebug,
} from '@sanity/cli-core'
import {confirm, logSymbols, spinner} from '@sanity/cli-core/ux'
import {resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'

import {appendFieldEntries} from '../../actions/media/cliConfigFields.js'
import {
  convertAspectDocuments,
  formatFieldEntries,
  type GeneratedFieldModule,
  type SkippedAspect,
} from '../../actions/media/pullAspects.js'
import {resolveMediaLibraryId} from '../../actions/media/resolveMediaLibraryId.js'
import {getAspects} from '../../services/mediaLibraries.js'
import {pluralize} from '../../util/pluralize.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const pullAspectsDebug = subdebug('media:pull-aspects')

const NOT_A_CONFIG_APP =
  'This command must be run inside a Media Library config app — a project whose ' +
  '`sanity.cli.ts` declares `unstable_defineMediaLibrary(...)`. Scaffold one with ' +
  '`sanity init --template media-library-config`.'

const flags = {
  'media-library-id': Flags.string({
    description:
      'The id of the media library to pull from (defaults to the single active library of the configured organization)',
  }),
  'out-dir': Flags.string({
    default: 'src/fields',
    description: 'Directory to write the generated field modules to, relative to the project root',
  }),
  overwrite: Flags.boolean({
    description:
      'Overwrite existing field modules and re-generate fields already declared in the config',
  }),
  'update-config': Flags.boolean({
    allowNo: true,
    description:
      'Declare the generated fields in sanity.cli.ts (--no-update-config to skip). Prompted when omitted; unattended runs only print the entries',
  }),
}

/**
 * The outcome of offering to declare the generated fields in `sanity.cli.ts`:
 * written, turned down (flag, prompt, or unattended), or not writable (the
 * config shape could not be edited safely — the `reason` says why).
 */
type Registration = 'added' | 'declined' | {reason: string}

export class MediaPullAspectsCommand extends SanityCommand<typeof MediaPullAspectsCommand> {
  static override description =
    "Generate field modules from a media library's stored aspect documents"

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Generate src/fields/<name>.tsx modules from the stored aspects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --media-library-id ml123 --overwrite',
      description: 'Pull from a specific media library, overwriting existing modules',
    },
  ]

  static override flags = flags

  // Part of the beta config-app flow: only usable inside a config app (like
  // the unlisted media-library-config init template, which points to it), and
  // listing it next to the legacy aspect commands would mix the two
  // paradigms. Unhide when the config app leaves beta.
  static override hidden = true

  // --out-dir is a local filesystem path.
  static telemetry = defineCommandTelemetry(flags, {redact: ['out-dir']})

  public async run(): Promise<void> {
    const {
      'media-library-id': mediaLibraryIdFlag,
      'out-dir': outDir,
      overwrite = false,
    } = this.flags

    let cliConfig: CliConfig
    try {
      cliConfig = await this.getCliConfig()
    } catch (err) {
      if (err instanceof ProjectRootNotFoundError) {
        this.error(NOT_A_CONFIG_APP, {exit: exitCodes.RUNTIME_ERROR})
      }
      throw err
    }

    const config = resolveWorkbenchConfig(cliConfig)
    if (!config) {
      this.error(NOT_A_CONFIG_APP, {exit: exitCodes.RUNTIME_ERROR})
    }

    const root = await this.getProjectRoot()
    // The generated `src:` entries and the ownership story both assume the
    // modules live inside the project; a path escaping the root is a mistake.
    // `outDirRelative` (not the raw flag) feeds the report so an absolute
    // --out-dir inside the root still prints proper relative `src:` entries.
    const outDirAbsolute = path.resolve(root.directory, outDir)
    const outDirRelative = path.relative(root.directory, outDirAbsolute)
    if (
      path.isAbsolute(outDirRelative) ||
      outDirRelative === '..' ||
      outDirRelative.startsWith(`..${path.sep}`)
    ) {
      this.error(`--out-dir must stay inside the project root (got "${outDir}")`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    try {
      const mediaLibraryId = await resolveMediaLibraryId({
        mediaLibraryIdFlag,
        organizationId: config.organizationId,
        unattended: this.isUnattended(),
      })

      const spin = spinner('Fetching stored aspect documents').start()
      let documents: Awaited<ReturnType<typeof getAspects>>
      try {
        documents = await getAspects(mediaLibraryId)
      } finally {
        // Also on failure — a spinner left running garbles the error output.
        spin.stop()
      }

      if (documents.length === 0) {
        this.log(
          `Media library ${styleText('bold', mediaLibraryId)} has no stored aspects — nothing to pull.`,
        )
        return
      }

      // Names already declared in the config are owned by existing field
      // modules; pulling the stored mirror back over them would regress local
      // edits, so they are skipped unless --overwrite says otherwise.
      const configuredNames = new Set(config.fields.map((field) => field.name))
      const configuredSrcByName = new Map(config.fields.map((field) => [field.name, field.src]))

      // One module per field name; name collisions and invalid documents are skipped.
      const {modules: winners, skipped} = convertAspectDocuments(documents)

      const generated: GeneratedFieldModule[] = []
      // Module name -> written path relative to the project root, so the
      // report shows where each module actually landed.
      const writtenPaths = new Map<string, string>()
      for (const module of winners) {
        if (!overwrite && configuredNames.has(module.name)) {
          skipped.push({
            id: module.name,
            reasons: ['Already declared in sanity.cli.ts (pass --overwrite to re-generate)'],
            status: 'skipped',
            validationErrors: [],
          })
          continue
        }

        const defaultDestination = path.join(outDirAbsolute, module.filename)
        // The pull generates `.tsx`, but a hand-written module for the same
        // field may be plain `.ts` — treat both as taken.
        const existing = await firstExisting([
          defaultDestination,
          defaultDestination.replace(/\.tsx$/, '.ts'),
        ])
        if (!overwrite && existing) {
          skipped.push({
            id: module.name,
            reasons: [
              `A file already exists at ${path.relative(root.directory, existing)} (pass --overwrite to replace it)`,
            ],
            status: 'skipped',
            validationErrors: [],
          })
          continue
        }

        // When overwriting a field the config already declares, the module
        // must land at the declared `src` path — writing <out-dir>/<name>.tsx
        // instead would orphan the new file while deploy keeps evaluating the
        // old one. Failing that, replace the module found on disk (which may
        // be the .ts variant), and only then fall back to the default.
        const declaredSrc = overwrite ? configuredSrcByName.get(module.name) : undefined
        const destination = declaredSrc
          ? await resolveDeclaredSrc(path.resolve(root.directory, declaredSrc), module.filename)
          : (existing ?? defaultDestination)

        await mkdir(path.dirname(destination), {recursive: true})
        await writeFile(destination, module.source)
        writtenPaths.set(module.name, path.relative(root.directory, destination))
        generated.push(module)
      }

      // Fields that are generated but not declared get offered for
      // registration: the deploy mirrors config to stored documents, so an
      // undeclared stored aspect is deleted by the next deploy — leaving the
      // entries unpasted is a data hazard, not just friction.
      const newEntries = generated.filter((module) => !configuredNames.has(module.name))
      const entryLines =
        newEntries.length > 0
          ? formatFieldEntries(newEntries, outDirRelative, writtenPaths).split('\n')
          : []
      const registration =
        newEntries.length > 0
          ? await this.maybeRegisterFields({configPath: root.path, entryLines})
          : null

      this.report({
        configuredNames,
        entryLines,
        generated,
        newEntries,
        outDir: outDirRelative,
        registration,
        skipped,
        writtenPaths,
      })
    } catch (error) {
      // Ctrl+C on the library prompt and errors that already carry their exit
      // code (`this.error` inside helpers) pass through to SanityCommand.catch.
      if (error instanceof Error && error.name === 'ExitPromptError') throw error
      if (error && typeof error === 'object' && 'oclif' in error) throw error
      const err = error as Error
      pullAspectsDebug('Failed to pull aspects', {error: err, mediaLibraryId: mediaLibraryIdFlag})
      this.error(
        styleText('bold', 'Failed to pull aspects') + `\n\n${styleText('red', err.message)}`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }
  }

  /**
   * Offer to declare the generated fields in `sanity.cli.ts`. `--update-config`
   * / `--no-update-config` decide outright; otherwise an interactive run
   * prompts (default yes) and an unattended run leaves the config alone.
   */
  private async maybeRegisterFields({
    configPath,
    entryLines,
  }: {
    configPath: string
    entryLines: string[]
  }): Promise<Registration> {
    const flag = this.flags['update-config']
    const shouldUpdate =
      flag ??
      (this.isUnattended()
        ? false
        : await confirm({
            default: true,
            message: `Declare the ${entryLines.length} generated ${pluralize('field', entryLines.length)} in sanity.cli.ts?`,
          }))
    if (!shouldUpdate) return 'declined'

    const source = await readFile(configPath, 'utf8')
    const result = appendFieldEntries(source, entryLines)
    if (!result.ok) return {reason: result.reason}
    await writeFile(configPath, result.updated)
    return 'added'
  }

  private report({
    configuredNames,
    entryLines,
    generated,
    newEntries,
    outDir,
    registration,
    skipped,
    writtenPaths,
  }: {
    configuredNames: Set<string>
    entryLines: string[]
    generated: GeneratedFieldModule[]
    newEntries: GeneratedFieldModule[]
    outDir: string
    registration: Registration | null
    skipped: SkippedAspect[]
    writtenPaths: Map<string, string>
  }): void {
    if (skipped.length > 0) {
      this.logToStderr('')
      this.warn(
        styleText('bold', `Skipped ${skipped.length} ${pluralize('aspect', skipped.length)}`),
      )
      for (const aspect of skipped) {
        const errors = aspect.validationErrors.flatMap((group) => group.map(({message}) => message))
        const reasons = [...aspect.reasons, ...errors]
        this.logToStderr(`  - ${aspect.id} ${styleText('dim', reasons.join('; '))}`)
      }
    }

    if (generated.length === 0) {
      this.log('')
      this.log('No field modules generated.')
      return
    }

    this.log('')
    this.log(
      `${logSymbols.success} ${styleText('bold', `Generated ${generated.length} field ${pluralize('module', generated.length)}`)}`,
    )
    for (const module of generated) {
      const location = writtenPaths.get(module.name) ?? path.join(outDir, module.filename)
      this.log(`  - ${module.name} ${styleText('dim', location)}`)
      for (const warning of module.warnings) {
        this.log(`    ${logSymbols.warning} ${warning}`)
      }
    }

    if (newEntries.length > 0 && registration === 'added') {
      this.log('')
      this.log(
        `${logSymbols.success} Declared ${newEntries.length} ${pluralize('field', newEntries.length)} in ${styleText('bold', 'sanity.cli.ts')}`,
      )
    } else if (newEntries.length > 0) {
      if (registration !== null && typeof registration === 'object') {
        this.warn(`Could not update sanity.cli.ts automatically: ${registration.reason}`)
      }
      this.log('')
      this.log(
        configuredNames.size > 0
          ? `Add the generated ${pluralize('field', newEntries.length)} to the \`fields\` array in ${styleText('bold', 'sanity.cli.ts')}:`
          : `Declare the generated ${pluralize('field', newEntries.length)} in ${styleText('bold', 'sanity.cli.ts')}:`,
      )
      this.log('')
      this.log(entryLines.map((line) => `  ${line}`).join('\n'))
      // The deploy mirrors config into stored documents; a pulled-but-undeclared
      // field reads as stale there, so leaving the entries out is destructive.
      this.warn(
        '`sanity deploy` deletes the stored definition of any field not declared in sanity.cli.ts.',
      )
    }

    this.log('')
    this.log(
      'Once declared in sanity.cli.ts, the config app owns these definitions — deploying the',
    )
    this.log('config overwrites the stored documents this pull read from. Stored definitions')
    this.log('not declared in sanity.cli.ts are deleted on deploy.')
  }
}

/**
 * The write target for a declared `src` path. A declared path may omit the
 * extension — the bundler and jiti both resolve `./src/fields/notes` to
 * `notes.ts(x)` — so writing it literally would create an extensionless file
 * next to the module deploy actually evaluates. Resolve to the existing
 * module file; if none exists, append the generated module's extension.
 */
async function resolveDeclaredSrc(declaredPath: string, moduleFilename: string): Promise<string> {
  if (path.extname(declaredPath) !== '') return declaredPath
  const existing = await firstExisting([`${declaredPath}.ts`, `${declaredPath}.tsx`])
  return existing ?? `${declaredPath}${path.extname(moduleFilename)}`
}

/** The first path in `paths` that exists, or `undefined`. */
async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const filePath of paths) {
    const exists = await access(filePath).then(
      () => true,
      () => false,
    )
    if (exists) return filePath
  }
  return undefined
}
