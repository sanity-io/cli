import {SanityCommand, subdebug} from '@sanity/cli-core'

import {type CorsOrigin, listCorsOrigins} from '../../services/cors.js'

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
    await this.parse(List)

    const projectId = await this.getProjectId()

    let origins: CorsOrigin[]
    try {
      origins = await listCorsOrigins(projectId)
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
