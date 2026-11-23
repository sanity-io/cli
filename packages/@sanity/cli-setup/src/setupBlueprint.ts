import {getGlobalCliClient, getProjectCliClient} from '@sanity/cli-core/apiClient'

import {checkBlueprintDestination, initBlueprint} from './initBlueprint.js'

interface BlueprintOptions {
  outputPath: string

  dataset?: string
  organization?: string

  project?: string
  projectName?: string
  visibility?: 'private' | 'public'
}

export async function setupBlueprint(options: BlueprintOptions, log: (message: string) => void) {
  const {
    dataset = 'production',
    organization,
    outputPath,
    project,
    projectName,
    visibility,
  } = options
  if (!project && !projectName) {
    throw new Error('Pass --project <id> or --project-name <name> with --organization <id>.')
  }
  if (project && (projectName || organization)) {
    throw new Error('Use --project on its own or pass --project-name with --organization.')
  }
  if (projectName && !organization) {
    throw new Error('Pass --organization <id> to create a project.')
  }
  checkBlueprintDestination(outputPath)

  log('Setting up a Blueprint')
  const userClient = await getGlobalCliClient({apiVersion: 'v2025-08-30', requireUser: true})
  await userClient.users.getById('me')

  let projectId = project
  if (projectName) {
    log('Creating a Sanity project')
    const client = userClient.withConfig({apiVersion: 'v2025-05-14'})
    const created = await client.request<{id?: string; projectId?: string}>({
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

  const client = await getProjectCliClient({
    apiVersion: 'v2025-09-16',
    projectId,
    requireUser: true,
  })
  const datasets = projectName ? [] : await client.datasets.list()
  if (!datasets.some(({name}) => name === dataset)) {
    log('Creating a dataset')
    await client.datasets.create(dataset, {aclMode: visibility ?? 'public'})
  }

  return initBlueprint({datasetName: dataset, output: {log}, outputPath, projectId})
}
