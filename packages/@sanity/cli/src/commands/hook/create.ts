import {getSanityUrl, SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {getProjectById} from '../../services/projects.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const createHookDebug = subdebug('hook:create')

export class CreateHookCommand extends SanityCommand<typeof CreateHookCommand> {
  static override description = 'Create a new webhook for the current project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a new webhook for the current project',
    },
  ]

  public async run() {
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let projectInfo: {organizationId?: string | null}
    try {
      projectInfo = await getProjectById(projectId)
    } catch (error) {
      const err = error as Error
      createHookDebug(`Error fetching project info for project ${projectId}`, err)
      this.error(`Failed to fetch project information:\n${err.message}`, {exit: 1})
    }

    const organizationId = projectInfo.organizationId || 'personal'
    const manageUrl = `${getSanityUrl()}/organizations/${organizationId}/project/${projectId}/api/webhooks/new`

    this.log(`Opening ${manageUrl}`)

    try {
      await open(manageUrl)
    } catch (error) {
      const err = error as Error
      createHookDebug('Error opening browser', err)
      this.error(`Failed to open browser:\n${err.message}`, {exit: 1})
    }
  }
}
