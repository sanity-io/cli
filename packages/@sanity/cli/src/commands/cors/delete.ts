import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {promptForProject} from '../../prompts/promptForProject.js'
import {type CorsOrigin, deleteCorsOrigin, listCorsOrigins} from '../../services/cors.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const deleteCorsDebug = subdebug('cors:delete')

export class Delete extends SanityCommand<typeof Delete> {
  static override args = {
    origin: Args.string({
      description: 'Origin to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete an existing CORS origin from your project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively select and delete a CORS origin',
    },
    {
      command: '<%= config.bin %> <%= command.id %> https://example.com',
      description: 'Delete a specific CORS origin',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'Delete a CORS origin from a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to delete CORS origin from (overrides CLI configuration)',
    }),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(Delete)

    // Ensure we have project context
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'delete', permission: 'sanity.project.cors'}],
        }),
    })

    // Get the origin ID to delete
    const originId = await this.promptForOrigin(args.origin, projectId)

    try {
      await deleteCorsOrigin({originId, projectId})

      this.log('Origin deleted')
    } catch (error) {
      const err = error as Error
      deleteCorsDebug(`Error deleting CORS origin ${originId} for project ${projectId}`, err)
      this.error(`Origin deletion failed:\n${err.message}`, {exit: 1})
    }
  }

  private async promptForOrigin(
    specifiedOrigin: string | undefined,
    projectId: string,
  ): Promise<number> {
    let origins: CorsOrigin[]
    try {
      origins = await listCorsOrigins(projectId)
    } catch (error) {
      const err = error as Error
      deleteCorsDebug(`Error fetching CORS origins for project ${projectId}`, err)
      this.error(`Failed to fetch CORS origins:\n${err.message}`, {exit: 1})
    }

    if (origins.length === 0) {
      this.error('No CORS origins configured for this project.', {exit: 1})
    }

    // If origin is specified, find it in the list
    if (specifiedOrigin) {
      const specifiedOriginLower = specifiedOrigin.toLowerCase()
      const selectedOrigin = origins.find(
        (origin) => origin.origin.toLowerCase() === specifiedOriginLower,
      )

      if (!selectedOrigin) {
        this.error(`Origin "${specifiedOrigin}" not found`, {exit: 1})
      }

      return selectedOrigin.id
    }

    // If no origin specified, prompt user to select one
    const choices = origins.map((origin) => ({
      name: origin.origin,
      value: origin.id,
    }))

    const selectedId = await select({
      choices,
      message: 'Select origin to delete',
    })

    return selectedId
  }
}
