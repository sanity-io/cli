import {type PackageManager} from './types.js'

export function getGlobalUninstallCommand(pm: PackageManager, packageName: string): string {
  switch (pm) {
    case 'bun': {
      return `bun remove -g ${packageName}`
    }
    case 'npm': {
      return `npm uninstall -g ${packageName}`
    }
    case 'pnpm': {
      return `pnpm remove -g ${packageName}`
    }
    case 'yarn': {
      return `yarn global remove ${packageName}`
    }
    default: {
      return `# Uninstall global package: ${packageName}`
    }
  }
}

export function getLocalRemoveCommand(pm: PackageManager, packageName: string): string {
  switch (pm) {
    case 'bun': {
      return `bun remove ${packageName}`
    }
    case 'npm': {
      return `npm uninstall ${packageName}`
    }
    case 'pnpm': {
      return `pnpm remove ${packageName}`
    }
    case 'yarn': {
      return `yarn remove ${packageName}`
    }
    default: {
      return `# Remove package: ${packageName}`
    }
  }
}
