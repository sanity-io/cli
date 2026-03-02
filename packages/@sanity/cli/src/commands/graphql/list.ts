import {styleText} from 'node:util'

import {getProjectCliClient, SanityCommand, subdebug} from '@sanity/cli-core'

import {
  GRAPHQL_API_VERSION,
  type GraphQLEndpoint,
  listGraphQLEndpoints,
} from '../../services/graphql.js'

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

    const client = await getProjectCliClient({
      apiVersion: GRAPHQL_API_VERSION,
      projectId,
    })

    this.log('Here are the GraphQL endpoints deployed for this project:')
    for (const [index, endpoint] of endpoints.entries()) {
      const {dataset, tag} = endpoint
      const url = client.getUrl(`/graphql/${dataset}/${tag}`)

      this.log(`${index + 1}.  ${styleText('bold', 'Dataset:')}     ${dataset}`)
      this.log(`    ${styleText('bold', 'Tag:')}         ${tag}`)
      this.log(`    ${styleText('bold', 'Generation:')}  ${endpoint.generation}`)
      this.log(`    ${styleText('bold', 'Playground:')}  ${endpoint.playgroundEnabled}`)
      this.log(`    ${styleText('bold', 'URL:')}  ${url}\n`)
    }
  }
}
