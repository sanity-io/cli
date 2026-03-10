import {SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForProject} from '../../prompts/promptForProject.js'
import {type CorsOrigin, listCorsOrigins} from '../../services/cors.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const listCorsDebug = subdebug('cors:list')

export class List extends SanityCommand<typeof List> {
  static override description = 'List all origins allowed to access the API for this project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List CORS origins for the current project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List CORS origins for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to list CORS origins for',
      semantics: 'override',
    }),
  }

  public async run(): Promise<void> {
    await this.parse(List)

    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.cors'}],
        }),
    })

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
