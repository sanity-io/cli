import {getSanityUrl, SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {promptForProject} from '../../prompts/promptForProject.js'
import {getProjectById} from '../../services/projects.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const createHookDebug = subdebug('hook:create')

export class CreateHookCommand extends SanityCommand<typeof CreateHookCommand> {
  static override description = 'Create a new webhook for the current project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Create a new webhook for the current project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'Create a webhook for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to create webhook for',
      semantics: 'override',
    }),
  }

  public async run() {
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({requiredPermissions: [{grant: 'read', permission: 'sanity.project'}]}),
    })

    let projectInfo: {organizationId?: string | null}
    try {
      projectInfo = await getProjectById(projectId)
    } catch (error) {
      const err = error as Error
      createHookDebug(`Error fetching project info for project ${projectId}`, err)
      this.error(`Failed to fetch project information:\n${err.message}`, {exit: 1})
    }

    const organizationId = projectInfo.organizationId || 'personal'
    const manageUrl = getSanityUrl(
      `/organizations/${organizationId}/project/${projectId}/api/webhooks/new`,
    )

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
