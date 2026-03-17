import {SanityCommand, subdebug} from '@sanity/cli-core'

import {type Hook} from '../../actions/hook/types'
import {promptForProject} from '../../prompts/promptForProject.js'
import {listHooksForProject} from '../../services/hooks.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const listHookDebug = subdebug('hook:list')

export class List extends SanityCommand<typeof List> {
  static override description = 'List hooks for a given project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List hooks for a given project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List hooks for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to list webhooks for',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['hook:list']

  public async run() {
    // Ensure we have project context
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.webhooks'}],
        }),
    })

    let hooks: Hook[]
    try {
      hooks = await listHooksForProject(projectId)
    } catch (error) {
      const err = error as Error

      listHookDebug(`Error fetching hooks for project ${projectId}`, err)
      this.error(`Hook list retrieval failed:\n${err.message}`, {exit: 1})
    }

    for (const hook of hooks) {
      this.log(`Name: ${hook.name}`)
      this.log(`Dataset: ${hook.dataset}`)
      this.log(`URL: ${hook.url}`)

      if (hook.type === 'document') {
        this.log(`HTTP method: ${hook.httpMethod}`)

        if (hook.description) {
          this.log(`Description: ${hook.description}`)
        }
      }

      this.log('')
    }
  }
}
