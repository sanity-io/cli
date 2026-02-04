import fs, {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {fileExists, SanityCommand, subdebug} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'
import {createPublishedId} from '@sanity/id-utils'
import {camelCase} from 'lodash-es'

import {getMediaLibraryConfig} from '../../actions/media/getMediaLibraryConfig.js'
import {NO_MEDIA_LIBRARY_ASPECTS_PATH} from '../../util/errorMessages.js'

const createAspectDebug = subdebug('media:create-aspect')

export class MediaCreateAspectCommand extends SanityCommand<typeof MediaCreateAspectCommand> {
  static override description = 'Create a new aspect definition file'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a new aspect definition file',
    },
  ]

  public async run(): Promise<void> {
    const cliConfig = await this.getCliConfig()
    const mediaLibrary = getMediaLibraryConfig(cliConfig)
    if (mediaLibrary?.aspectsPath === undefined) {
      this.error(NO_MEDIA_LIBRARY_ASPECTS_PATH, {exit: 1})
    }

    try {
      const title = await input({
        message: 'Title',
      })

      const name = await input({
        default: createPublishedId(camelCase(title)),
        message: 'Name',
      })

      const safeName = createPublishedId(camelCase(name))
      const destinationPath = path.resolve(mediaLibrary.aspectsPath, `${safeName}.ts`)
      const relativeDestinationPath = path.relative(process.cwd(), destinationPath)

      await mkdir(path.resolve(mediaLibrary.aspectsPath), {
        recursive: true,
      })

      const destinationPathExists = await fileExists(destinationPath)
      if (destinationPathExists) {
        this.error(`A file already exists at ${styleText('bold', relativeDestinationPath)}`, {
          exit: 1,
        })
      }

      await fs.writeFile(
        destinationPath,
        template({
          name: safeName,
          title,
        }),
      )

      this.log(
        `${styleText('green', '✓')} Aspect created! ${styleText('bold', relativeDestinationPath)}`,
      )
      this.log()
      this.log('Next steps:')
      this.log(
        `Open ${styleText('bold', relativeDestinationPath)} in your code editor and customize the aspect.`,
      )
      this.log()
      this.log('Deploy this aspect by running:')
      this.log(styleText('bold', `sanity media deploy-aspect ${safeName}`))
      this.log()
      this.log('Deploy all aspects by running:')
      this.log(styleText('bold', `sanity media deploy-aspect --all`))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      createAspectDebug('Failed to create aspect', error)
      this.error(`Failed to create aspect: ${message}`, {exit: 1})
    }
  }
}

function template({name, title}: {name: string; title: string}) {
  return `import {defineAssetAspect, defineField} from 'sanity'

export default defineAssetAspect({
  name: '${name}',
  title: '${title}',
  type: 'object',
  fields: [
    defineField({
      name: 'string',
      title: 'Plain String',
      type: 'string',
    }),
  ],
})
`
}
