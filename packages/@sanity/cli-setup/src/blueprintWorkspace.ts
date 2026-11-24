import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {dirname, extname, join} from 'node:path'

import {BLUEPRINT_FILE_NAMES, STACK_CONFIG_DIR, STACK_CONFIG_FILE} from '@sanity/blueprints/resolve'

import {writeGitignoreFile} from './gitignore.js'

export const JSON_BLUEPRINT_CONTENT = {
  blueprintVersion: '2024-10-01',
  resources: [],
}

export const TS_BLUEPRINT_CONTENT = `
import {defineBlueprint, defineDocumentFunction} from '@sanity/blueprints'

export default defineBlueprint({
  resources: [
    // defineDocumentFunction({name: 'my-function', event: {on: ['create', 'update']}}),
  ],
})
`.trim()

const configName = join(STACK_CONFIG_DIR, STACK_CONFIG_FILE)

type WorkspaceConfig = (
  | {organizationId: string; projectId?: never}
  | {organizationId?: never; projectId: string}
) & {
  runtimeCliVersion?: string
  stackId?: string
}

export function checkBlueprintDestination(outputPath: string): void {
  const existing = [...BLUEPRINT_FILE_NAMES, configName].find((name) =>
    existsSync(join(outputPath, name)),
  )
  if (existing) {
    throw new Error(
      `${join(outputPath, existing)} already exists. Pass \`--output-path\` with a different directory.`,
    )
  }
}

export function writeBlueprintToDisk({
  blueprintFilePath,
  jsonContent = JSON_BLUEPRINT_CONTENT,
  overwrite = true,
}: {
  blueprintFilePath: string
  jsonContent?: Record<string, unknown>
  overwrite?: boolean
}): string {
  const extension = extname(blueprintFilePath)
  let content: string
  switch (extension) {
    case '.js':
    case '.mjs':
    case '.ts': {
      content = TS_BLUEPRINT_CONTENT
      break
    }
    case '.json': {
      content = JSON.stringify(jsonContent, null, 2)
      break
    }
    default: {
      throw new Error(`Unsupported Blueprint manifest extension: ${extension}`)
    }
  }
  mkdirSync(dirname(blueprintFilePath), {recursive: true})
  writeFileSync(blueprintFilePath, content, {flag: overwrite ? 'w' : 'wx'})
  return content
}

/** Write a manifest and connect it to the caller's chosen scope and Stack. */
export async function initializeBlueprintWorkspace<T extends WorkspaceConfig>({
  blueprintExtension,
  jsonContent,
  outputPath,
  overwrite = false,
  resolveConfig,
}: {
  blueprintExtension: string
  jsonContent?: Record<string, unknown>
  outputPath: string
  overwrite?: boolean
  resolveConfig: (blueprintPath: string) => Promise<T> | T
}) {
  if (!overwrite) checkBlueprintDestination(outputPath)

  const blueprintPath = join(outputPath, `sanity.blueprint.${blueprintExtension}`)
  const configPath = join(outputPath, configName)
  writeBlueprintToDisk({blueprintFilePath: blueprintPath, jsonContent, overwrite})
  const config = await resolveConfig(blueprintPath)

  try {
    mkdirSync(dirname(configPath), {recursive: true})
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...config,
          blueprintConfigVersion: 'v2025-05-08',
          internalEnv: process.env.SANITY_INTERNAL_ENV,
          updatedAt: Date.now(),
        },
        null,
        2,
      ),
      {flag: overwrite ? 'w' : 'wx'},
    )
  } catch (error) {
    const scope = config.projectId
      ? `--project-id ${config.projectId}`
      : `--organization-id ${config.organizationId}`
    const recovery = config.stackId
      ? `\nFrom ${outputPath}, run \`npx @sanity/cli blueprints init ${scope} --stack-id ${config.stackId}\` to connect the Blueprint.`
      : ''
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not save ${configPath}. ${message}${recovery}`, {cause: error})
  }

  const gitignore = writeGitignoreFile(blueprintPath)
  return {blueprintPath, config, configPath, gitignore}
}
