import {select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {CORS_API_VERSION} from '../../actions/cors/constants.js'
import {type CorsOrigin} from '../../actions/cors/types.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

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
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(Delete)

    const client = await this.getGlobalApiClient({
      apiVersion: CORS_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Get the origin ID to delete
    const originId = await this.promptForOrigin(args.origin, client, projectId)

    // Delete the origin
    try {
      await client.request({
        method: 'DELETE',
        uri: `/projects/${projectId}/cors/${originId}`,
      })

      this.log('Origin deleted')
    } catch (error) {
      const err = error as Error
      deleteCorsDebug(`Error deleting CORS origin ${originId} for project ${projectId}`, err)
      this.error(`Origin deletion failed:\n${err.message}`, {exit: 1})
    }
  }

  private async promptForOrigin(
    specifiedOrigin: string | undefined,
    client: Awaited<ReturnType<typeof this.getGlobalApiClient>>,
    projectId: string,
  ): Promise<number> {
    // Fetch all CORS origins
    let origins: CorsOrigin[]
    try {
      origins = await client.request<CorsOrigin[]>({uri: `/projects/${projectId}/cors`})
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
