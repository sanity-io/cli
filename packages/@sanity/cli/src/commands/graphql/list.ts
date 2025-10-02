import {SanityCommand, subdebug} from '@sanity/cli-core'
import chalk from 'chalk'

import {
  GRAPHQL_API_VERSION,
  type GraphQLEndpoint,
  listGraphQLEndpoints,
} from '../../services/graphql.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const listGraphQLDebug = subdebug('graphql:list')

export class List extends SanityCommand<typeof List> {
  static override description = 'List all GraphQL endpoints deployed for this project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List GraphQL endpoints for the current project',
    },
  ]

  public async run(): Promise<void> {
    await this.parse(List)

    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    let endpoints: GraphQLEndpoint[] | undefined
    try {
      endpoints = await listGraphQLEndpoints(projectId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      listGraphQLDebug(`Error fetching GraphQL endpoints for project ${projectId}`, error)
      this.error(`GraphQL endpoints list retrieval failed:\n${message}`, {exit: 1})
    }

    if (!endpoints || endpoints.length === 0) {
      this.log("This project doesn't have any GraphQL endpoints deployed.")
      return
    }

    const client = await this.getProjectApiClient({
      apiVersion: GRAPHQL_API_VERSION,
      projectId,
    })

    this.log('Here are the GraphQL endpoints deployed for this project:')
    for (const [index, endpoint] of endpoints.entries()) {
      const {dataset, tag} = endpoint
      const url = client.getUrl(`/graphql/${dataset}/${tag}`)

      this.log(`${index + 1}.  ${chalk.bold('Dataset:')}     ${dataset}`)
      this.log(`    ${chalk.bold('Tag:')}         ${tag}`)
      this.log(`    ${chalk.bold('Generation:')}  ${endpoint.generation}`)
      this.log(`    ${chalk.bold('Playground:')}  ${endpoint.playgroundEnabled}`)
      this.log(`    ${chalk.bold('URL:')}  ${url}\n`)
    }
  }
}
