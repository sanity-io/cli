import {access, mkdir, writeFile} from 'node:fs/promises'
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
import {logSymbols, spinner} from '@sanity/cli-core/ux'
import {resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'

import {
  aspectDocumentToFieldModule,
  formatFieldEntries,
  type GeneratedFieldModule,
  type PullableAspectDocument,
  type SkippedAspect,
} from '../../actions/media/pullAspects.js'
import {promptForMediaLibrary} from '../../prompts/promptForMediaLibrary.js'
import {getAspects, getMediaLibrariesForOrganization} from '../../services/mediaLibraries.js'
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
}

/** A generated module paired with the stored document it came from. */
interface GeneratedCandidate {
  module: GeneratedFieldModule
  sourceId: string
}

export class MediaPullAspectsCommand extends SanityCommand<typeof MediaPullAspectsCommand> {
  static override description =
    "Generate field modules from a media library's stored aspect documents"

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Generate src/fields/<name>.ts modules from the stored aspects',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --media-library-id ml123 --overwrite',
      description: 'Pull from a specific media library, overwriting existing modules',
    },
  ]

  static override flags = flags

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
      const mediaLibraryId = await this.resolveMediaLibraryId(
        config.organizationId,
        mediaLibraryIdFlag,
      )

      const spin = spinner('Fetching stored aspect documents').start()
      const documents = await getAspects(mediaLibraryId)
      spin.stop()

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

      const skipped: SkippedAspect[] = []

      // First pass: convert every stored document.
      const candidates: GeneratedCandidate[] = []
      for (const doc of documents) {
        const outcome = aspectDocumentToFieldModule(doc as unknown as PullableAspectDocument)
        if (outcome.status === 'skipped') {
          skipped.push(outcome)
        } else {
          candidates.push({module: outcome, sourceId: String(doc._id)})
        }
      }

      // Second pass: one module per field name. Two stored documents can
      // resolve to the same name (a legacy document whose `_id` predates its
      // `definition.name`), which would write the same file twice — the
      // document whose `_id` matches the name wins, the rest are skipped.
      const byName = new Map<string, GeneratedCandidate[]>()
      for (const candidate of candidates) {
        const group = byName.get(candidate.module.name) ?? []
        group.push(candidate)
        byName.set(candidate.module.name, group)
      }
      const winners: GeneratedFieldModule[] = []
      for (const [name, group] of byName) {
        const winner = group.find((candidate) => candidate.sourceId === name) ?? group[0]
        winners.push(winner.module)
        for (const loser of group) {
          if (loser === winner) continue
          skipped.push({
            id: loser.sourceId,
            reasons: [`Also defines "${name}" — generated from "${winner.sourceId}" instead`],
            status: 'skipped',
            validationErrors: [],
          })
        }
      }

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
        // The pull generates `.ts`, but a hand-written module for the same
        // field may be `.tsx` (the template ships one) — treat both as taken.
        const existing = await firstExisting([
          defaultDestination,
          defaultDestination.replace(/\.ts$/, '.tsx'),
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
        // must land at the declared `src` path — writing <out-dir>/<name>.ts
        // instead would orphan the new file while deploy keeps evaluating the
        // old one. Failing that, replace the module found on disk (which may
        // be the .tsx variant), and only then fall back to the default.
        const declaredSrc = overwrite ? configuredSrcByName.get(module.name) : undefined
        const destination = declaredSrc
          ? path.resolve(root.directory, declaredSrc)
          : (existing ?? defaultDestination)

        await mkdir(path.dirname(destination), {recursive: true})
        await writeFile(destination, module.source)
        writtenPaths.set(module.name, path.relative(root.directory, destination))
        generated.push(module)
      }

      this.report({configuredNames, generated, outDir: outDirRelative, skipped, writtenPaths})
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

  private report({
    configuredNames,
    generated,
    outDir,
    skipped,
    writtenPaths,
  }: {
    configuredNames: Set<string>
    generated: GeneratedFieldModule[]
    outDir: string
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

    const newEntries = generated.filter((module) => !configuredNames.has(module.name))
    if (newEntries.length > 0) {
      this.log('')
      this.log(
        configuredNames.size > 0
          ? `Add the generated ${pluralize('field', newEntries.length)} to the \`fields\` array in ${styleText('bold', 'sanity.cli.ts')}:`
          : `Declare the generated ${pluralize('field', newEntries.length)} in ${styleText('bold', 'sanity.cli.ts')}:`,
      )
      this.log('')
      this.log(
        formatFieldEntries(newEntries, outDir, writtenPaths)
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
    }

    this.log('')
    this.log(
      'Once declared in sanity.cli.ts, the config app owns these definitions — deploying the',
    )
    this.log('config overwrites the stored documents this pull read from.')
  }

  /**
   * The flag wins; otherwise a single active library of the configured
   * organization is unambiguous, and multiple actives prompt (or, unattended,
   * demand the flag). Misuse (a bad flag value, a missing required flag)
   * exits with the usage code.
   */
  private async resolveMediaLibraryId(
    organizationId: string,
    mediaLibraryIdFlag: string | undefined,
  ): Promise<string> {
    const libraries = await getMediaLibrariesForOrganization(organizationId)

    if (mediaLibraryIdFlag) {
      if (!libraries.some((library) => library.id === mediaLibraryIdFlag)) {
        this.error(
          `Media library ${mediaLibraryIdFlag} is not an active library of organization ` +
            `${organizationId} (found: ${libraries.map((library) => library.id).join(', ') || 'none'})`,
          {exit: exitCodes.USAGE_ERROR},
        )
      }
      return mediaLibraryIdFlag
    }

    if (libraries.length === 0) {
      throw new Error(`Organization ${organizationId} has no active media library`)
    }
    if (libraries.length === 1) {
      return libraries[0].id
    }
    if (this.isUnattended()) {
      this.error(
        `Organization ${organizationId} has ${libraries.length} active media libraries ` +
          `(${libraries.map((library) => library.id).join(', ')}). Pass \`--media-library-id\`.`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }
    return promptForMediaLibrary({mediaLibraries: libraries})
  }
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
