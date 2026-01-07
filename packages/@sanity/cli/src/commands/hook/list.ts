import {SanityCommand, subdebug} from '@sanity/cli-core'

import {type Hook} from '../../actions/hook/types'
import {listHooksForProject} from '../../services/hooks.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const listHookDebug = subdebug('hook:list')

export class List extends SanityCommand<typeof List> {
  static override description = 'List hooks for a given project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List hooks for a given project',
    },
  ]

  public async run() {
    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

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
