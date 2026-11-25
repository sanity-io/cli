import {type FlagInput} from '@oclif/core/interfaces'
import {getStudioConfig, SanityCommand} from '@sanity/cli-core'
import open from 'open'

import {getManageUrl} from '../actions/projects/getManageUrl.js'

export class ManageCommand extends SanityCommand<typeof ManageCommand> {
  static override description = 'Open project settings in your browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(ManageCommand)

    const cliConfig = await this.getCliConfig()
    // Read the projectId from the CLI config
    let projectId = cliConfig?.api?.projectId

    if (!projectId) {
      const projectRoot = await this.getProjectRoot()
      const config = await getStudioConfig(projectRoot.directory, {resolvePlugins: false})
      if (!Array.isArray(config) && config.projectId) {
        projectId = config.projectId
      }
    }

    const url = getManageUrl(projectId)

    this.log(`Opening ${url}`)
    await open(url)
  }
}
