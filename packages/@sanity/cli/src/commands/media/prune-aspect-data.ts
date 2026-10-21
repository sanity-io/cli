import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {
  type CliConfig,
  exitCodes,
  ProjectRootNotFoundError,
  SanityCommand,
  subdebug,
} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {resolveWorkbenchConfig} from '@sanity/workbench-cli/deploy'

import {VALID_ASPECT_NAME} from '../../actions/media/aspectSync/contract.js'
import {resolveMediaLibraryId} from '../../actions/media/resolveMediaLibraryId.js'
import {
  getAspectDataCarrierIds,
  getStoredAspectIds,
  unsetAspectData,
} from '../../services/mediaLibraries.js'
import {pluralize} from '../../util/pluralize.js'

const pruneAspectDataDebug = subdebug('media:prune-aspect-data')

const NOT_A_CONFIG_APP =
  'This command must be run inside a Media Library config app — a project whose ' +
  '`sanity.cli.ts` declares `unstable_defineMediaLibrary(...)`. Scaffold one with ' +
  '`sanity init --template media-library-config`.'

/** Unset-patch batch size per mutate request. */
const BATCH_SIZE = 100

/** How many carrier ids the report lists before truncating. */
const SAMPLE_SIZE = 10

/**
 * The deliberate, explicitly-invoked counterpart to the deploy-time aspect
 * sync: deploying a config only mirrors aspect *definitions* — `aspects.<name>`
 * values on assets are never touched and resurface if a matching field comes
 * back. This command removes that data. Irreversible fan-out mutation, so it
 * never prompts: without `--yes` it only reports what would change.
 */
export class MediaPruneAspectDataCommand extends SanityCommand<typeof MediaPruneAspectDataCommand> {
  static override args = {
    aspectName: Args.string({
      description: 'Name of the aspect whose data to remove from all assets',
      required: true,
    }),
  }

  static override description =
    "Irreversibly remove an aspect's data (aspects.<name> values) from every asset of a media library"

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> legacyAspect',
      description: 'Report which assets carry aspects.legacyAspect (changes nothing)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> legacyAspect --yes',
      description: 'Remove aspects.legacyAspect from every asset that carries it',
    },
  ]

  static override flags = {
    'media-library-id': Flags.string({
      description:
        'The id of the media library to prune (defaults to the single active library of the configured organization)',
    }),
    yes: Flags.boolean({
      description:
        'Execute the prune. Without this flag the command only reports what would change',
    }),
  }

  // Part of the beta config-app flow: the command requires a config app to
  // resolve its organization, so listing it in the general help would only
  // route legacy-flow users into the beta paradigm. The prune itself is
  // paradigm-neutral (it only unsets asset data) — when there is demand from
  // the legacy flow, ungate it from the config app and unhide it.
  static override hidden = true

  public async run(): Promise<void> {
    const {aspectName} = this.args
    const {'media-library-id': mediaLibraryIdFlag, yes = false} = this.flags

    // The name rule shared with the sync contract; also makes the
    // interpolation into the carrier GROQ filter injection-safe.
    if (!VALID_ASPECT_NAME.test(aspectName)) {
      this.error(`"${aspectName}" is not a valid aspect name (${VALID_ASPECT_NAME})`, {
        exit: exitCodes.USAGE_ERROR,
      })
    }

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
      const mediaLibraryId = await resolveMediaLibraryId({
        mediaLibraryIdFlag,
        organizationId: config.organizationId,
        unattended: this.isUnattended(),
      })

      const spin = spinner('Finding assets that carry the aspect').start()
      const storedIds = await getStoredAspectIds(mediaLibraryId)
      const carriers = await getAspectDataCarrierIds(mediaLibraryId, aspectName)
      spin.stop()

      // Guardrails, not gates: pruning while either is true can be deliberate
      // (e.g. clearing data before re-shaping a field), so warn and continue.
      if (config.fields.some((field) => field.name === aspectName)) {
        this.warn(
          `"${aspectName}" is still declared in sanity.cli.ts — its data is likely in active use and will grow back.`,
        )
      }
      if (storedIds.includes(aspectName)) {
        this.warn(
          `Aspect definition "${aspectName}" still exists in the library — this only removes data, not the definition.`,
        )
      }

      if (carriers.length === 0) {
        this.log(
          `No assets in media library ${styleText('bold', mediaLibraryId)} carry ${styleText(
            'bold',
            `aspects.${aspectName}`,
          )} — nothing to prune.`,
        )
        return
      }

      const sample = carriers.slice(0, SAMPLE_SIZE)
      this.log(
        `${styleText('bold', String(carriers.length))} ${pluralize(
          'asset',
          carriers.length,
        )} in media library ${styleText('bold', mediaLibraryId)} ${
          carriers.length === 1 ? 'carries' : 'carry'
        } ${styleText('bold', `aspects.${aspectName}`)}:`,
      )
      for (const id of sample) {
        this.log(`  - ${id}`)
      }
      if (carriers.length > sample.length) {
        this.log(styleText('dim', `  … and ${carriers.length - sample.length} more`))
      }

      if (!yes) {
        this.log('')
        this.log(
          `This would ${styleText(
            'bold',
            'irreversibly',
          )} unset aspects.${aspectName} on all of them. Re-run with ${styleText(
            'bold',
            '--yes',
          )} to execute.`,
        )
        return
      }

      let pruned = 0
      for (let offset = 0; offset < carriers.length; offset += BATCH_SIZE) {
        const batch = carriers.slice(offset, offset + BATCH_SIZE)
        await unsetAspectData({aspectName, assetIds: batch, mediaLibraryId})
        pruned += batch.length
        this.log(styleText('dim', `  pruned ${pruned}/${carriers.length}`))
      }

      this.log('')
      this.log(
        `${styleText('green', '✓')} aspects.${aspectName} removed from ${pruned} ${pluralize(
          'asset',
          pruned,
        )}.`,
      )
    } catch (error) {
      const err = error as Error
      pruneAspectDataDebug('Failed to prune aspect data', {
        aspectName,
        error: err,
      })
      this.error(
        styleText('bold', 'Failed to prune aspect data') + `\n\n${styleText('red', err.message)}`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }
  }
}
