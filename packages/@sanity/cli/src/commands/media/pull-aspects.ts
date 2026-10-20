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
import {spinner} from '@sanity/cli-core/ux'
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

const pullAspectsDebug = subdebug('media:pull-aspects')

const NOT_A_CONFIG_APP =
  'This command must be run inside a Media Library config app — a project whose ' +
  '`sanity.cli.ts` declares `unstable_defineMediaLibrary(...)`. Scaffold one with ' +
  '`sanity init --template media-library-config`.'

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

  static override flags = {
    'media-library-id': Flags.string({
      description:
        'The id of the media library to pull from (defaults to the single active library of the configured organization)',
    }),
    'out-dir': Flags.string({
      default: 'src/fields',
      description:
        'Directory to write the generated field modules to, relative to the project root',
    }),
    overwrite: Flags.boolean({
      description:
        'Overwrite existing field modules and re-generate fields already declared in the config',
    }),
  }

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

      const generated: GeneratedFieldModule[] = []
      const skipped: SkippedAspect[] = []

      for (const doc of documents) {
        const outcome = aspectDocumentToFieldModule(doc as unknown as PullableAspectDocument)

        if (outcome.status === 'skipped') {
          skipped.push(outcome)
          continue
        }

        if (!overwrite && configuredNames.has(outcome.name)) {
          skipped.push({
            id: outcome.name,
            reasons: ['Already declared in sanity.cli.ts (pass --overwrite to re-generate)'],
            status: 'skipped',
            validationErrors: [],
          })
          continue
        }

        const root = await this.getProjectRoot()
        const destination = path.resolve(root.directory, outDir, outcome.filename)
        if (!overwrite && (await fileExists(destination))) {
          skipped.push({
            id: outcome.name,
            reasons: [
              `A file already exists at ${path.relative(root.directory, destination)} (pass --overwrite to replace it)`,
            ],
            status: 'skipped',
            validationErrors: [],
          })
          continue
        }

        await mkdir(path.dirname(destination), {recursive: true})
        await writeFile(destination, outcome.source)
        generated.push(outcome)
      }

      this.report({configuredNames, generated, outDir, skipped})
    } catch (error) {
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
  }: {
    configuredNames: Set<string>
    generated: GeneratedFieldModule[]
    outDir: string
    skipped: SkippedAspect[]
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
      `${styleText('green', '✓')} ${styleText('bold', `Generated ${generated.length} field ${pluralize('module', generated.length)}`)}`,
    )
    for (const module of generated) {
      this.log(`  - ${module.name} ${styleText('dim', `${outDir}/${module.filename}`)}`)
      for (const warning of module.warnings) {
        this.log(`    ${styleText('yellow', '⚠')} ${warning}`)
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
        formatFieldEntries(newEntries, outDir)
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
   * demand the flag).
   */
  private async resolveMediaLibraryId(
    organizationId: string,
    mediaLibraryIdFlag: string | undefined,
  ): Promise<string> {
    const libraries = await getMediaLibrariesForOrganization(organizationId)

    if (mediaLibraryIdFlag) {
      if (!libraries.some((library) => library.id === mediaLibraryIdFlag)) {
        throw new Error(
          `Media library ${mediaLibraryIdFlag} is not an active library of organization ` +
            `${organizationId} (found: ${libraries.map((library) => library.id).join(', ') || 'none'})`,
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
      throw new Error(
        `Organization ${organizationId} has ${libraries.length} active media libraries ` +
          `(${libraries.map((library) => library.id).join(', ')}). Pass \`--media-library-id\`.`,
      )
    }
    return promptForMediaLibrary({mediaLibraries: libraries})
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  )
}
