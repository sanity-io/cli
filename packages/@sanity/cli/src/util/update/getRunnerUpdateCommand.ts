import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {type PackageRunner} from './packageRunner.js'

const BIN_NAMES: Record<SanityPackage, string> = {
  '@sanity/cli': 'sanity',
  sanity: 'sanity',
}

export function getRunnerUpdateCommand(runner: PackageRunner, packageName: SanityPackage): string {
  const binName = BIN_NAMES[packageName]

  switch (runner) {
    case 'bunx': {
      return `bunx ${packageName}@latest`
    }
    case 'npx': {
      return `npx --yes ${packageName}@latest`
    }
    case 'pnpm-dlx': {
      return `pnpm dlx ${packageName}@latest`
    }
    case 'yarn-dlx': {
      // yarn dlx only needs `-p` when the package name differs from the bin name
      return binName === packageName
        ? `yarn dlx ${packageName}@latest`
        : `yarn dlx -p ${packageName}@latest ${binName}`
    }
    default: {
      const _exhaustive: never = runner
      throw new Error(`Unknown runner: ${_exhaustive as string}`)
    }
  }
}
