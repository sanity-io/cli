import {readFile} from 'node:fs/promises'

import {parse as parseYaml, stringify as stringifyYaml} from 'yaml'

/**
 * Packages a Studio release publishes. Excluding them lets a fixture install the
 * release immediately. Everything else keeps pnpm's default release-age gate.
 */
const STUDIO_RELEASE_EXCLUDE = [
  '@portabletext/*',
  '@sanity/*',
  '@sanity-labs/*',
  'sanity',
  'sanity-plugin-media',
] as const

/** `allowBuilds` for a fixture install, plus the Studio packages CI should see immediately. */
export function fixtureWorkspaceConfig(
  workspace: {allowBuilds?: unknown},
  source = 'pnpm-workspace.yaml',
): {allowBuilds: unknown; minimumReleaseAgeExclude: readonly string[]} {
  if (!('allowBuilds' in workspace)) {
    throw new Error(`Could not find 'allowBuilds' in ${source}`)
  }

  return {
    allowBuilds: workspace.allowBuilds,
    minimumReleaseAgeExclude: STUDIO_RELEASE_EXCLUDE,
  }
}

export async function buildFixtureWorkspace(yamlPath: string): Promise<string> {
  const parsed: unknown = parseYaml(await readFile(yamlPath, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Could not read workspace settings from ${yamlPath}`)
  }

  return stringifyYaml(fixtureWorkspaceConfig(parsed, yamlPath))
}
