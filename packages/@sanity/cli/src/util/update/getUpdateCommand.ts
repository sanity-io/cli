import {type PackageManager} from '../packageManager/packageManagerChoice.js'

/**
 * Get the appropriate update command for the package manager
 */
export default function getUpdateCommand(pm: PackageManager): string {
  const commands: Record<PackageManager, string> = {
    bun: 'bun install -g @sanity/cli',
    manual: 'npm install -g @sanity/cli',
    npm: 'npm install -g @sanity/cli',
    pnpm: 'pnpm add -g @sanity/cli',
    yarn: 'yarn global add @sanity/cli',
  }
  return commands[pm]
}
