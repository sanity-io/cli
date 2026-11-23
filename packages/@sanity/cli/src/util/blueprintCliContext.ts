import {CLIError} from '@oclif/core/errors'
import {getBlueprintProfile, isBlueprintMode} from '@sanity/cli-core/config'

export {getBlueprintProfile as getBlueprintCliContext} from '@sanity/cli-core/config'

export function usesLocalCliConfig(id?: string, argv: string[] = []): boolean {
  if (id === 'blueprints:profiles:set' || isBlueprintMode()) return false
  if (id !== 'init') return true
  const separator = argv.indexOf('--')
  const flags = separator === -1 ? argv : argv.slice(0, separator)
  return !flags.includes('--with-blueprints') || flags.includes('--from-create')
}

export async function getBlueprintDataset(projectId: string): Promise<string | undefined> {
  const context = await getBlueprintProfile()
  if (context && (!context.projectId || context.projectId === projectId)) return context.dataset
}

export function datasetRequiredMessage(legacyMessage: string): string {
  if (!isBlueprintMode()) return legacyMessage
  return 'Dataset is required. Pass `--dataset <name>`, set SANITY_DATASET, or select a profile with a dataset for this project.'
}

export async function requireLocalConfig<T>(
  load: () => Promise<T>,
  kind: 'Studio' | 'Studio or app',
): Promise<T> {
  if (isBlueprintMode()) {
    throw new CLIError(
      `This command needs a local ${kind} configuration. Run it from the project directory with SANITY_CLI_MODE=legacy.`,
    )
  }
  return load()
}
