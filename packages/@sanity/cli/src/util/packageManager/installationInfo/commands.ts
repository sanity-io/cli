import {getYarnMajorVersion} from '@sanity/cli-core/package-manager'

import {type LockfileType} from './types.js'

export function getGlobalUninstallCommand(pm: LockfileType, packageName: string): string {
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
  }
}

interface UpdateCommandOptions {
  /** Whether the project uses Yarn Berry (v2+), determined from .yarnrc.yml. */
  yarnBerry?: boolean
}

export function getLocalUpdateCommand(
  pm: LockfileType,
  packageName: string,
  options?: UpdateCommandOptions,
): string {
  switch (pm) {
    case 'bun': {
      return `bun update ${packageName}`
    }
    case 'npm': {
      return `npm update ${packageName}`
    }
    case 'pnpm': {
      return `pnpm update ${packageName}`
    }
    case 'yarn': {
      // Prefer project-level detection (.yarnrc.yml) over process user-agent,
      // since the doctor command may be invoked via a different package manager.
      const isBerry = options?.yarnBerry ?? isYarnBerryFromProcess()
      return `yarn ${isBerry ? 'up' : 'upgrade'} ${packageName}`
    }
  }
}

function isYarnBerryFromProcess(): boolean {
  const yarnMajor = getYarnMajorVersion()
  return yarnMajor !== undefined && yarnMajor >= 2
}

export function getLocalRemoveCommand(pm: LockfileType, packageName: string): string {
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
  }
}
