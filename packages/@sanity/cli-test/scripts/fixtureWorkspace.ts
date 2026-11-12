import {readFile} from 'node:fs/promises'

import {parse as parseYaml, stringify as stringifyYaml} from 'yaml'

/**
 * Build-script allowlist a fixture install runs under.
 *
 * A fixture is a sample project, installed with `--no-lockfile` in its own workspace.
 * The workspace file keeps that install from joining this repository, and pnpm reads
 * `allowBuilds` from it. The allowlist is copied so native dependencies such as
 * `esbuild` can run their scripts.
 *
 * The repository's `minimumReleaseAge` stays behind. That 72-hour gate guards this
 * repo's lockfile. Copying it made every fixture install strict, so a new `@sanity/ui`
 * that required `motion@^14.12.0` aborted setup on every shard until those releases
 * turned 72 hours old. A fixture leaves the age unset and gets pnpm's own default:
 * skip a release from the last 24 hours when an older match exists, and install an
 * in-range release when none does.
 */
export function fixtureWorkspaceConfig(
  workspace: {allowBuilds?: unknown},
  source = 'pnpm-workspace.yaml',
): {allowBuilds: unknown} {
  if (!('allowBuilds' in workspace)) {
    throw new Error(`Could not find 'allowBuilds' in ${source}`)
  }

  return {allowBuilds: workspace.allowBuilds}
}

/**
 * Reads the repository `pnpm-workspace.yaml` and serializes the fixture workspace config.
 *
 * @param yamlPath - Path to the repository's pnpm-workspace.yaml
 * @returns Serialized workspace config for fixtures
 */
export async function buildFixtureWorkspace(yamlPath: string): Promise<string> {
  const parsed: unknown = parseYaml(await readFile(yamlPath, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Could not read workspace settings from ${yamlPath}`)
  }

  return stringifyYaml(fixtureWorkspaceConfig(parsed, yamlPath))
}
