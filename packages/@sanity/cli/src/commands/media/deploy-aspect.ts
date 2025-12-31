import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {chalk, spinner} from '@sanity/cli-core/ux'
import {isAssetAspect, type SchemaValidationProblem} from '@sanity/types'

import {getMediaLibraryConfig} from '../../actions/media/getMediaLibraryConfig.js'
import {importAspects} from '../../actions/media/importAspects.js'
import {selectMediaLibrary} from '../../prompts/selectMediaLibrary.js'
import {deployAspects} from '../../services/mediaLibraries.js'
import {NO_MEDIA_LIBRARY_ASPECTS_PATH, NO_PROJECT_ID} from '../../util/errorMessages.js'
import {pluralize} from '../../util/pluralize.js'

const deployAspectDebug = subdebug('media:deploy-aspect')

export class MediaDeployAspectCommand extends SanityCommand<typeof MediaDeployAspectCommand> {
  static override args = {
    aspectName: Args.string({
      description: 'Name of the aspect to deploy',
      required: false,
    }),
  }

  static override description = 'Deploy an aspect'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> someAspect',
      description: 'Deploy the aspect named "someAspect"',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --all',
      description: 'Deploy all aspects',
    },
  ]

  static override flags = {
    all: Flags.boolean({
      description: 'Deploy all aspects',
      required: false,
    }),
    'media-library-id': Flags.string({
      description: 'The id of the target media library',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {aspectName} = this.args
    const {all, 'media-library-id': mediaLibraryIdFlag} = this.flags

    // Validation: must provide either aspect name or --all flag
    if (!all && !aspectName) {
      this.error(
        'Specify an aspect name, or use the `--all` option to deploy all aspect definitions.',
        {exit: 1},
      )
    }

    // Validation: cannot provide both aspect name and --all flag
    if (all && aspectName) {
      this.error('Specified both an aspect name and `--all`.', {exit: 1})
    }

    const cliConfig = await this.getCliConfig()
    const mediaLibrary = getMediaLibraryConfig(cliConfig)

    if (!mediaLibrary?.aspectsPath) {
      this.error(NO_MEDIA_LIBRARY_ASPECTS_PATH, {exit: 1})
    }

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    try {
      // Determine target media library
      let mediaLibraryId = mediaLibraryIdFlag
      if (!mediaLibraryId) {
        mediaLibraryId = await selectMediaLibrary(projectId)
      }

      // Import and validate aspects
      const spin = spinner('Loading aspect definitions').start()
      const result = await importAspects({
        aspectsPath: mediaLibrary.aspectsPath,
        filterAspects: (aspect) => {
          if (all) {
            return true
          }

          if (typeof aspect === 'object' && aspect !== null && '_id' in aspect) {
            return aspect._id === aspectName
          }

          return false
        },
      })
      spin.stop()

      // Handle invalid aspects
      if (result.invalid.length > 0) {
        this.logToStderr('')
        this.warn(
          chalk.bold(
            `Skipped ${result.invalid.length} invalid ${pluralize('aspect', result.invalid.length)}`,
          ),
        )
        this.logToStderr(this.formatAspectList(result.invalid))
      }

      // Check if we found the requested aspect (when not using --all)
      if (!all && result.valid.length === 0 && result.invalid.length === 0) {
        this.log()
        this.error(`Could not find aspect: ${chalk.bold(aspectName)}`, {exit: 1})
      }

      // Deploy valid aspects
      if (result.valid.length === 0) {
        this.logToStderr('')
        this.warn('No valid aspects to deploy')
        return
      }

      const deploySpin = spinner(
        `Deploying ${result.valid.length} ${pluralize('aspect', result.valid.length)}`,
      ).start()

      const deployResponse = await deployAspects({
        aspects: result.valid.map((a) => a.aspect),
        mediaLibraryId,
      })

      deploySpin.succeed()

      // Display success message
      this.log()
      this.log(
        `${chalk.green('✓')} ${chalk.bold(`Deployed ${result.valid.length} ${pluralize('aspect', result.valid.length)}`)}`,
      )
      this.log(this.formatAspectList(result.valid))

      deployAspectDebug('Deployed aspects', {
        count: result.valid.length,
        results: deployResponse.results,
      })
    } catch (error) {
      console.log(error)
      const err = error as Error
      deployAspectDebug('Failed to deploy aspects', {
        all,
        aspectName,
        error: err,
        mediaLibraryId: mediaLibraryIdFlag,
      })
      this.error(chalk.bold('Failed to deploy aspects') + `\n\n${chalk.red(err.message)}`, {
        exit: 1,
      })
    }
  }

  /**
   * Format a list of aspects for display
   */
  private formatAspectList(
    aspects: Array<{
      aspect: unknown
      filename: string
      validationErrors?: SchemaValidationProblem[][]
    }>,
  ): string {
    return aspects
      .map(({aspect, filename, validationErrors = []}) => {
        const label = isAssetAspect(aspect) ? aspect._id : 'Unnamed aspect'

        // Flatten the nested validation errors and extract messages
        const simplifiedErrors = validationErrors.flatMap((group) =>
          group.map(({message}) => message),
        )

        const errorLabel = simplifiedErrors.length > 0 ? ` ${chalk.bgRed(simplifiedErrors[0])}` : ''

        const remainingErrorsCount = simplifiedErrors.length - 1
        const remainingErrorsLabel =
          remainingErrorsCount > 0
            ? chalk.italic(
                ` and ${remainingErrorsCount} other ${pluralize('error', remainingErrorsCount)}`,
              )
            : ''

        return `  - ${label} ${chalk.dim(filename)}${errorLabel}${remainingErrorsLabel}`
      })
      .join('\n')
  }
}
