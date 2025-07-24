import {type FlagInput} from '@oclif/core/interfaces'
import {getStudioConfig, SanityCommand} from '@sanity/cli-core'
import open from 'open'

export class ManageCommand extends SanityCommand<typeof ManageCommand> {
  static override description = 'Opens project management interface in your web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(ManageCommand)

    const cliConfig = await this.getCliConfig()
    // Read the projectId from the CLI config
    let projectId = cliConfig?.api?.projectId

    if (!projectId) {
      const projectRoot = await this.getProjectRoot()
      // TODO: Move this to a util or baseclass
      const config = await getStudioConfig(projectRoot.directory, {resolvePlugins: false})
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
