import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'

import {type BlueprintDatasetResource} from '@sanity/blueprints'
import {DEFAULT_BLUEPRINTS_API_VERSION} from '@sanity/blueprints/resolve'
import {type Output} from '@sanity/cli-core'
import {getGlobalCliClient} from '@sanity/cli-core/apiClient'
import {initializeBlueprintWorkspace, JSON_BLUEPRINT_CONTENT} from '@sanity/cli-setup'

export async function initBlueprint({
  datasetName,
  datasetResource,
  output,
  outputPath,
  projectId,
  showProfileSetup = true,
}: {
  datasetName: string
  datasetResource?: BlueprintDatasetResource
  output: Pick<Output, 'log'>
  outputPath: string
  projectId: string
  showProfileSetup?: boolean
}) {
  const {blueprintPath, config, configPath} = await initializeBlueprintWorkspace({
    blueprintExtension: 'json',
    jsonContent: {
      ...JSON_BLUEPRINT_CONTENT,
      $schema: 'https://schemas.sanity.io/blueprints/v2024-10-01/blueprint.schema.json',
      resources: datasetResource ? [datasetResource] : [],
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
  if (datasetResource)
    output.log(
      `The Blueprint declares dataset "${datasetName}". Deploy the Blueprint to create it.`,
    )
  if (showProfileSetup) {
    const profile = projectId.toLowerCase()
    const manifest = quoteShellArg(resolve(blueprintPath))
    output.log(
      `Save a Blueprint profile with \`sanity blueprints profiles set ${profile} --project ${quoteShellArg(projectId)} --dataset ${quoteShellArg(datasetName)} --stack ${quoteShellArg(stackId)} --path ${manifest}\`.`,
    )
    output.log(`Set SANITY_BLUEPRINT_PROFILE=${profile} to use the profile from any directory.`)
  } else {
    output.log(`From ${outputPath}, run \`npx @sanity/cli blueprints plan\` to review changes.`)
  }
  return {
    blueprintPath,
    configPath,
    dataset: datasetName,
    projectId,
    stackId,
  }
}

function quoteShellArg(value: string): string {
  return /^[\w./:@=,-]+$/.test(value) ? value : `'${value.replaceAll("'", String.raw`'\''`)}'`
}
