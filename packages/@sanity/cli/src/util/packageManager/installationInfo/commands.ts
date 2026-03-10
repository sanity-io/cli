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

export function getLocalUpdateCommand(pm: LockfileType, packageName: string): string {
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
      const yarnMajor = getYarnMajorVersion()
      const cmd = yarnMajor !== undefined && yarnMajor >= 2 ? 'up' : 'upgrade'
      return `yarn ${cmd} ${packageName}`
    }
  }
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
