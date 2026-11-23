import {type FlagInput} from '@oclif/core/interfaces'
import {getSanityUrl, getStudioConfig, SanityCommand} from '@sanity/cli-core'
import {isProjectRootNotFoundError} from '@sanity/cli-core/errors'
import open from 'open'

import {getManageUrl} from '../actions/projects/getManageUrl.js'
import {getBlueprintCliContext} from '../util/blueprintCliContext.js'

export class ManageCommand extends SanityCommand<typeof ManageCommand> {
  static override description = 'Open project settings in your browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(ManageCommand)

    let projectId: string | undefined
    let organizationId: string | undefined
    try {
      const cliConfig = await this.getCliConfig()
      projectId = cliConfig?.api?.projectId
      if (!projectId) {
        const projectRoot = await this.getProjectRoot()
        const config = await getStudioConfig(projectRoot.directory, {resolvePlugins: false})
        if (!Array.isArray(config)) projectId = config.projectId
      }
    } catch (error) {
      if (!isProjectRootNotFoundError(error)) throw error
      const workspace = await getBlueprintCliContext()
      if (!workspace) throw error
      projectId = workspace.projectId
      organizationId = workspace.organizationId
    }

    const url = organizationId
      ? getSanityUrl(`/organizations/${organizationId}`)
      : getManageUrl(projectId)

    this.log(`Opening ${url}`)
    await open(url)
  }
}
