import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {type Blueprint} from '@sanity/blueprints'
import {
  BLUEPRINT_FILE_NAMES,
  DEFAULT_BLUEPRINTS_API_VERSION,
  STACK_CONFIG_DIR,
  STACK_CONFIG_FILE,
} from '@sanity/blueprints/resolve'
import {type Output} from '@sanity/cli-core'
import {getGlobalCliClient} from '@sanity/cli-core/apiClient'

const blueprintFileName = 'sanity.blueprint.json'

export function checkBlueprintDestination(outputPath: string): void {
  const existing = [...BLUEPRINT_FILE_NAMES, join(STACK_CONFIG_DIR, STACK_CONFIG_FILE)].find(
    (name) => existsSync(join(outputPath, name)),
  )
  if (existing) {
    throw new Error(
      `${join(outputPath, existing)} already exists. Pass \`--output-path\` with a different directory.`,
    )
  }
}

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
  checkBlueprintDestination(outputPath)
  const configDir = join(outputPath, STACK_CONFIG_DIR)
  await mkdir(configDir, {recursive: true})

  const blueprintPath = join(outputPath, blueprintFileName)
  const blueprint: Blueprint = {
    $schema: 'https://schemas.sanity.io/blueprints/v2024-10-01/blueprint.schema.json',
    blueprintVersion: '2024-10-01',
    resources: [],
    values: {dataset: datasetName},
  }
  await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, {flag: 'wx'})

  const stackName = `init-${projectId}-${randomUUID().slice(0, 8)}`
  let stackId: string
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
    stackId = stack.id
  } catch (error) {
    throw new Error(
      `Saved ${blueprintPath}. Could not create Stack "${stackName}". ${error instanceof Error ? error.message : String(error)}\n` +
        `From ${outputPath}, run \`npx @sanity/cli blueprints init --project-id ${projectId}\` to connect the Blueprint to a Stack.`,
      {cause: error},
    )
  }

  const configPath = join(configDir, STACK_CONFIG_FILE)
  const config = {blueprintConfigVersion: 'v2025-05-08', projectId, stackId}
  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {flag: 'wx'})
  } catch (error) {
    throw new Error(
      `Created Stack ${stackId}. Could not save ${configPath}. ${error instanceof Error ? error.message : String(error)}\n` +
        `From ${outputPath}, run \`npx @sanity/cli blueprints init --project-id ${projectId} --stack-id ${stackId}\` to connect the Blueprint.`,
      {cause: error},
    )
  }

  output.log(`Created ${blueprintPath}`)
  output.log(`Connected the Blueprint to Stack ${stackId} in project ${projectId}.`)
  output.log(`From ${outputPath}, run \`npx @sanity/cli blueprints plan\` to review changes.`)
  return {blueprintPath, configPath, dataset: datasetName, projectId, stackId}
}
