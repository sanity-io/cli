// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {getRunningPackageManager} from '@sanity/cli-core/package-manager'

/**
 * Get the command to run the create script with the correct package manager,
 * and optionally with a flag separator if needed.
 *
 * @param options - Options for the command generation.
 * @returns The create command for the running package manager.
 * @internal
 */
export function getCreateCommand(options?: {withFlagSeparator?: boolean}): string {
  const pm = getRunningPackageManager() ?? 'npm'
  // npm requires `--` to forward flags to the create script, other PMs don't
  const sep = options?.withFlagSeparator && pm === 'npm' ? ' --' : ''
  if (pm === 'bun') return `bun create sanity@latest${sep}`
  if (pm === 'pnpm') return `pnpm create sanity@latest${sep}`
  if (pm === 'yarn') return `yarn create sanity@latest${sep}`
  return `npm create sanity@latest${sep}`
}
