import {readFile} from 'node:fs/promises'

import {parse as parseYaml, stringify as stringifyYaml} from 'yaml'

/** `allowBuilds` for a fixture install. The repository release-age gate is not copied. */
export function fixtureWorkspaceConfig(
  workspace: {allowBuilds?: unknown},
  source = 'pnpm-workspace.yaml',
): {allowBuilds: unknown} {
  if (!('allowBuilds' in workspace)) {
    throw new Error(`Could not find 'allowBuilds' in ${source}`)
  }

  return {allowBuilds: workspace.allowBuilds}
}

export async function buildFixtureWorkspace(yamlPath: string): Promise<string> {
  const parsed: unknown = parseYaml(await readFile(yamlPath, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Could not read workspace settings from ${yamlPath}`)
  }

  return stringifyYaml(fixtureWorkspaceConfig(parsed, yamlPath))
}
