// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import {getRunningPackageManager} from '@sanity/cli-core/package-manager'

export function getCreateCommand(options?: {withFlagSeparator?: boolean}): string {
  const pm = getRunningPackageManager() ?? 'npm'
  // npm requires `--` to forward flags to the create script, other PMs don't
  const sep = options?.withFlagSeparator && (pm === 'npm' || !pm) ? ' --' : ''
  if (pm === 'bun') return `bun create sanity@latest${sep}`
  if (pm === 'pnpm') return `pnpm create sanity@latest${sep}`
  if (pm === 'yarn') return `yarn create sanity@latest${sep}`
  return `npm create sanity@latest${sep}`
}
