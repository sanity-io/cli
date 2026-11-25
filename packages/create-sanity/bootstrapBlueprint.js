import {randomUUID} from 'node:crypto'

import {DEFAULT_BLUEPRINTS_API_VERSION} from '@sanity/blueprints/resolve'
import {
  checkBlueprintDestination,
  initializeBlueprintWorkspace,
  JSON_BLUEPRINT_CONTENT,
} from '@sanity/cli-setup'

import {getBlueprintClient} from './blueprintSession.js'

const datasetApiVersion = 'v2025-09-16'
const projectApiVersion = 'v2025-05-14'

export async function bootstrapBlueprint(options, log) {
  const {dataset, organization, project, projectName, visibility} = options
  if (options.outputPath) checkBlueprintDestination(options.outputPath)
  log('Setting up a Blueprint')

  const client = await getBlueprintClient(options, log)

  let projectId = project
  if (projectName) {
    log('Creating a Sanity project')
    const created = await client.withConfig({apiVersion: projectApiVersion}).request({
      body: {
        displayName: projectName,
        metadata: {integration: 'cli'},
        organizationId: organization,
      },
      method: 'POST',
      url: '/projects',
    })
    projectId = created.projectId || created.id
  }
  if (!projectId) throw new Error('The Sanity API returned no project ID.')

  const projectClient = client.withConfig({
    apiVersion: datasetApiVersion,
    projectId,
    useProjectHostname: true,
  })
  const datasets = projectName ? [] : await projectClient.datasets.list()
  if (!datasets.some(({name}) => name === dataset)) {
    log('Creating a dataset')
    const aclMode = projectName ? visibility : (visibility ?? 'public')
    await projectClient.datasets.create(dataset, aclMode ? {aclMode} : {})
  }

  let outputPath = options.outputPath
  if (!outputPath) {
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- only load prompts when an output path is needed
    const {promptBlueprintOutputPath} = await import('./promptBlueprint.js')
    outputPath = await promptBlueprintOutputPath(projectId)
  }

  const {blueprintPath, config} = await initializeBlueprintWorkspace({
    blueprintExtension: 'json',
    jsonContent: {
      ...JSON_BLUEPRINT_CONTENT,
      $schema: 'https://schemas.sanity.io/blueprints/v2024-10-01/blueprint.schema.json',
      values: {dataset},
    },
    outputPath,
    resolveConfig: async (manifestPath) => {
      const stackName = `init-${projectId}-${randomUUID().slice(0, 8)}`
      try {
        const stack = await client
          .withConfig({
            apiVersion: process.env.SANITY_BLUEPRINTS_API_VERSION ?? DEFAULT_BLUEPRINTS_API_VERSION,
            maxRetries: 0,
          })
          .request({
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
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Saved ${manifestPath}. Could not create Stack "${stackName}". ${message}\n` +
            `From ${outputPath}, run \`npx @sanity/cli blueprints init --project-id ${projectId}\` to connect the Blueprint to a Stack.`,
          {cause: error},
        )
      }
    },
  })

  log(`Created ${blueprintPath}`)
  log(`Connected the Blueprint to Stack ${config.stackId} in project ${projectId}.`)
  log(`From ${outputPath}, run \`npx @sanity/cli blueprints plan\` to review changes.`)
}
