import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {HOOK_API_VERSION} from '../../actions/hook/constants.js'
import {type Hook} from '../../actions/hook/types'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const deleteHookDebug = subdebug('hook:delete')

export class Delete extends SanityCommand<typeof Delete> {
  static override args = {
    name: Args.string({
      description: 'Name of hook to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete a hook within your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively select and delete a hook',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-hook',
      description: 'Delete a specific hook by name',
    },
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(Delete)

    const client = await this.getGlobalApiClient({
      apiVersion: HOOK_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Get the hook ID to delete
    const hookId = await this.promptForHook(args.name, client, projectId)

    // Delete the hook
    try {
      await client.request({
        method: 'DELETE',
        uri: `/hooks/projects/${projectId}/${hookId}`,
      })

      this.log('Hook deleted')
    } catch (error) {
      const err = error as Error
      deleteHookDebug(`Error deleting hook ${hookId} for project ${projectId}`, err)
      this.error(`Hook deletion failed:\n${err.message}`, {exit: 1})
    }
  }

  private async promptForHook(
    specifiedName: string | undefined,
    client: Awaited<ReturnType<typeof this.getGlobalApiClient>>,
    projectId: string,
  ): Promise<string> {
    // Fetch all hooks for this project
    let hooks: Hook[]
    try {
      hooks = await client.request<Hook[]>({uri: `/hooks/projects/${projectId}`})
    } catch (error) {
      const err = error as Error
      deleteHookDebug(`Error fetching hooks for project ${projectId}`, err)
      this.error(`Failed to fetch hooks:\n${err.message}`, {exit: 1})
    }

    if (hooks.length === 0) {
      this.error('No hooks configured for this project.', {exit: 1})
    }

    // If hook name is specified, find it in the list
    if (specifiedName) {
      const specifiedNameLower = specifiedName.toLowerCase()
      const selectedHook = hooks.find((hook) => hook.name.toLowerCase() === specifiedNameLower)

      if (!selectedHook) {
        this.error(`Hook with name "${specifiedName}" not found`, {exit: 1})
      }

      return selectedHook.id
    }

    // If no hook name specified, prompt user to select one
    const choices = hooks.map((hook) => ({
      name: hook.name,
      value: hook.id,
    }))

    const selectedId = await select({
      choices,
      message: 'Select hook to delete',
    })

    return selectedId
  }
}
