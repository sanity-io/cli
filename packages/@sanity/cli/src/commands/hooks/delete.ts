import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {
  guardBlueprintResource,
  matchesResourceProject,
  reportBlueprintManagedError,
  resourceAttachmentId,
  resourceValue,
} from '../../actions/blueprints/guardResource.js'
import {type Hook} from '../../actions/hook/types'
import {resolveProjectForCommand} from '../../actions/targets/blueprintCommandTarget.js'
import {deleteHookForProject, listHooksForProject} from '../../services/hooks.js'
import {getProjectIdFlag, getWithBlueprintsFlag} from '../../util/sharedFlags.js'

const deleteHookDebug = subdebug('hook:delete')

export class Delete extends SanityCommand<typeof Delete> {
  static override args = {
    name: Args.string({
      description: 'Name of webhook to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete a webhook from the project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively select and delete a webhook',
    },
    {
      command: '<%= config.bin %> <%= command.id %> my-hook',
      description: 'Delete a specific webhook by name',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project abc123',
      description: 'Delete a webhook from a specific project',
    },
  ]

  static override flags = {
    ...getWithBlueprintsFlag(),
    ...getProjectIdFlag({
      description: 'Project ID to delete webhook from',
      semantics: 'override',
    }),
  }

  static override hiddenAliases: string[] = ['hook:delete']

  public async run(): Promise<void> {
    const {args} = await this.parse(Delete)

    if (!args.name && this.isUnattended()) {
      this.error('Webhook name is required. Pass the name as an argument.', {
        exit: exitCodes.USAGE_ERROR,
      })
    }

    const projectId = await resolveProjectForCommand(this, this.flags, [
      {grant: 'delete', permission: 'sanity.project.webhooks'},
    ])

    // Get the hook ID to delete
    const {id: hookId, name, type, url} = await this.promptForHook(args.name, projectId)
    const label = `webhook "${name}"`
    if (this.flags['with-blueprints'] && type !== 'transaction') {
      await guardBlueprintResource(
        this.output,
        {id: projectId, type: 'project'},
        {
          id: hookId,
          label,
          matches: (resource, blueprint) =>
            matchesResourceProject(resource, blueprint, projectId) &&
            (resourceAttachmentId(resource) === hookId ||
              (('displayName' in resource ? resource.displayName : resource.name) === name &&
                'url' in resource &&
                resourceValue(resource.url, blueprint) === url)),
          type: 'sanity.project.webhook',
        },
        'delete',
      )
    }

    try {
      await deleteHookForProject(projectId, hookId)

      this.log('Hook deleted')
    } catch (error) {
      if (this.flags['with-blueprints'])
        reportBlueprintManagedError(this.output, error, label, 'delete')
      const err = error as Error
      deleteHookDebug(`Error deleting hook ${hookId} for project ${projectId}`, err)
      this.error(`Hook deletion failed:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private async promptForHook(specifiedName: string | undefined, projectId: string): Promise<Hook> {
    let hooks: Hook[]
    try {
      hooks = await listHooksForProject(projectId)
    } catch (error) {
      const err = error as Error
      deleteHookDebug(`Error fetching hooks for project ${projectId}`, err)
      this.error(`Failed to fetch hooks:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }

    if (hooks.length === 0) {
      this.error('No hooks configured for this project.', {exit: exitCodes.RUNTIME_ERROR})
    }

    // If hook name is specified, find it in the list
    if (specifiedName) {
      const specifiedNameLower = specifiedName.toLowerCase()
      const selectedHook = hooks.find((hook) => hook.name.toLowerCase() === specifiedNameLower)

      if (!selectedHook) {
        this.error(`Hook with name "${specifiedName}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }

      return selectedHook
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

    const hook = hooks.find(({id}) => id === selectedId)
    if (!hook) this.error('The selected webhook could not be found.')
    return hook
  }
}
