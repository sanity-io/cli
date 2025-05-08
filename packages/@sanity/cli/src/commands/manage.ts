import {type FlagInput} from '@oclif/core/interfaces'
import open from 'open'

import {SanityCliCommand} from '../BaseCommand.js'
import {getStudioConfig} from '../config/studio/getStudioConfig.js'

export default class ManageCommand extends SanityCliCommand<typeof ManageCommand> {
  static override description = 'Opens project management interface in your web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(ManageCommand)

    // Read the projectId from the CLI config
    let projectId = this.cliConfig?.api?.projectId

    if (!projectId) {
      const config = await getStudioConfig(this.projectRoot.directory, {resolvePlugins: false})
      if (!Array.isArray(config) && config.projectId) {
        projectId = config.projectId
      }
    }

    const url = projectId
      ? `https://www.sanity.io/manage/project/${projectId}`
      : 'https://www.sanity.io/manage/'

    this.log(`Opening ${url}`)
    await open(url)
  }
}
