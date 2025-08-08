import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {HOOK_API_VERSION} from '../../actions/hook/constants.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const createHookDebug = subdebug('hook:create')

export class Create extends SanityCommand<typeof Create> {
  static override description = 'Create a new hook for the given dataset'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a new hook for the given dataset',
    },
  ]

  public async run() {
    const client = await this.getGlobalApiClient({
      apiVersion: HOOK_API_VERSION,
      requireUser: true,
    })

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let projectInfo: {organizationId?: string | null}
    try {
      projectInfo = await client.projects.getById(projectId)
    } catch (error) {
      const err = error as Error
      createHookDebug(`Error fetching project info for project ${projectId}`, err)
      this.error(`Failed to fetch project information:\n${err.message}`, {exit: 1})
    }

    const organizationId = projectInfo.organizationId || 'personal'
    const manageUrl = `https://www.sanity.io/organizations/${organizationId}/project/${projectId}/api/webhooks/new`

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
