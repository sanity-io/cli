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
import {isAssetAspect, type SchemaValidationProblem} from '@sanity/types'

import {getMediaLibraryConfig} from '../../actions/media/getMediaLibraryConfig.js'
import {importAspects} from '../../actions/media/importAspects.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {selectMediaLibrary} from '../../prompts/selectMediaLibrary.js'
import {deployAspects} from '../../services/mediaLibraries.js'
import {NO_MEDIA_LIBRARY_ASPECTS_PATH} from '../../util/errorMessages.js'
import {pluralize} from '../../util/pluralize.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

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
    ...getProjectIdFlag({
      description: 'Project ID to deploy media aspect to',
      semantics: 'override',
    }),
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
        'Aspect name is required. Pass it as the `<aspectName>` argument, or pass `--all`.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    // Validation: cannot provide both aspect name and --all flag
    if (all && aspectName) {
      this.error('Specify either the `<aspectName>` argument or `--all`, but not both.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    let cliConfig: CliConfig
    try {
      cliConfig = await this.getCliConfig()
    } catch (err) {
      if (err instanceof ProjectRootNotFoundError) {
        this.error(
          'This command must be run from within a Sanity project directory (requires media library configuration)',
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      throw err
    }
    const mediaLibrary = getMediaLibraryConfig(cliConfig)

    if (!mediaLibrary?.aspectsPath) {
      this.error(NO_MEDIA_LIBRARY_ASPECTS_PATH, {exit: exitCodes.RUNTIME_ERROR})
    }

    const projectId = await this.getProjectId({fallback: () => promptForProject({})})

    if (!mediaLibraryIdFlag && this.isUnattended()) {
      this.error('Media library ID is required. Pass it with `--media-library-id <id>`.', {
        exit: exitCodes.USAGE_ERROR,
      })
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
          styleText(
            'bold',
            `Skipped ${result.invalid.length} invalid ${pluralize('aspect', result.invalid.length)}`,
          ),
        )
        this.logToStderr(this.formatAspectList(result.invalid))
      }

      // Check if we found the requested aspect (when not using --all)
      if (!all && result.valid.length === 0 && result.invalid.length === 0) {
        this.log()
        this.error(`Could not find aspect: ${styleText('bold', aspectName ?? '')}`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
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
        `${styleText('green', '✓')} ${styleText('bold', `Deployed ${result.valid.length} ${pluralize('aspect', result.valid.length)}`)}`,
      )
      this.log(this.formatAspectList(result.valid))

      deployAspectDebug('Deployed aspects', {
        count: result.valid.length,
        results: deployResponse.results,
      })
    } catch (error) {
      const err = error as Error
      deployAspectDebug('Failed to deploy aspects', {
        all,
        aspectName,
        error: err,
        mediaLibraryId: mediaLibraryIdFlag,
      })
      this.error(
        styleText('bold', 'Failed to deploy aspects') + `\n\n${styleText('red', err.message)}`,
        {
          exit: exitCodes.RUNTIME_ERROR,
        },
      )
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

        const errorLabel =
          simplifiedErrors.length > 0 ? ` ${styleText('bgRed', simplifiedErrors[0])}` : ''

        const remainingErrorsCount = simplifiedErrors.length - 1
        const remainingErrorsLabel =
          remainingErrorsCount > 0
            ? styleText(
                'italic',
                ` and ${remainingErrorsCount} other ${pluralize('error', remainingErrorsCount)}`,
              )
            : ''

        return `  - ${label} ${styleText('dim', filename)}${errorLabel}${remainingErrorsLabel}`
      })
      .join('\n')
  }
}
