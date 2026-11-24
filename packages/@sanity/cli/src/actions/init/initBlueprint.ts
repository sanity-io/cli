import {randomUUID} from 'node:crypto'

import {DEFAULT_BLUEPRINTS_API_VERSION} from '@sanity/blueprints/resolve'
import {type Output} from '@sanity/cli-core'
import {getGlobalCliClient} from '@sanity/cli-core/apiClient'
import {initializeBlueprintWorkspace, JSON_BLUEPRINT_CONTENT} from '@sanity/cli-setup'

export async function initBlueprint({
  datasetName,
  output,
  outputPath,
  projectId,
}: {
  datasetName: string
  output: Pick<Output, 'log'>
  outputPath: string
  projectId: string
}) {
  const {blueprintPath, config, configPath} = await initializeBlueprintWorkspace({
    blueprintExtension: 'json',
    jsonContent: {
      ...JSON_BLUEPRINT_CONTENT,
      $schema: 'https://schemas.sanity.io/blueprints/v2024-10-01/blueprint.schema.json',
      values: {dataset: datasetName},
    },
    outputPath,
    resolveConfig: async (manifestPath) => {
      const stackName = `init-${projectId}-${randomUUID().slice(0, 8)}`
      try {
        const client = await getGlobalCliClient({
          apiVersion: process.env.SANITY_BLUEPRINTS_API_VERSION ?? DEFAULT_BLUEPRINTS_API_VERSION,
          maxRetries: 0,
          requireUser: true,
        })
        const stack = await client.request<{id: string}>({
          body: {
            document: {resources: []},
            name: stackName,
            scopeId: projectId,
            scopeType: 'project',
            useProjectBasedId: false,
          },
          headers: {'x-sanity-scope-id': projectId, 'x-sanity-scope-type': 'project'},
          method: 'POST',
          url: '/blueprints/stacks',
        })
        if (!stack.id) throw new Error('The API returned no Stack ID.')
        return {projectId, stackId: stack.id}
      } catch (error) {
        throw new Error(
          `Saved ${manifestPath}. Could not create Stack "${stackName}". ${error instanceof Error ? error.message : String(error)}\n` +
            `From ${outputPath}, run \`npx @sanity/cli blueprints init --project-id ${projectId}\` to connect the Blueprint to a Stack.`,
          {cause: error},
        )
      }
    },
  })
  const {stackId} = config

  output.log(`Created ${blueprintPath}`)
  output.log(`Connected the Blueprint to Stack ${stackId} in project ${projectId}.`)
  output.log(`From ${outputPath}, run \`npx @sanity/cli blueprints plan\` to review changes.`)
  return {blueprintPath, configPath, dataset: datasetName, projectId, stackId}
}
