import {SanityCommand, subdebug} from '@sanity/cli-core'

import {CORS_API_VERSION} from '../../actions/cors/constants.js'
import {type CorsOrigin} from '../../actions/cors/types.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const listCorsDebug = subdebug('cors:list')

export class List extends SanityCommand<typeof List> {
  static override description = 'List all origins allowed to access the API for this project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List CORS origins for the current project',
    },
  ]

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(List)

    const client = await this.getGlobalApiClient({
      apiVersion: CORS_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let origins: CorsOrigin[]
    try {
      origins = await client.request<CorsOrigin[]>({uri: `/projects/${projectId}/cors`})
    } catch (error) {
      const err = error as Error

      listCorsDebug(`Error fetching CORS origins for project ${projectId}`, err)
      this.error(`CORS origins list retrieval failed:\n${err.message}`, {exit: 1})
    }

    if (origins.length === 0) {
      this.log('No CORS origins configured for this project.')
      return
    }

    // Output each origin on a new line, matching the original behavior
    this.log(origins.map((origin) => origin.origin).join('\n'))
  }
}
