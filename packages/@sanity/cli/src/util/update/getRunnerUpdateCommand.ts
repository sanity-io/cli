import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {type PackageRunner} from './packageRunner.js'

export function getRunnerUpdateCommand(runner: PackageRunner, packageName: SanityPackage): string {
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
      return packageName === 'sanity'
        ? `yarn dlx ${packageName}@latest`
        : `yarn dlx -p ${packageName}@latest sanity`
    }
    default: {
      const _exhaustive: never = runner
      throw new Error(`Unknown runner: ${_exhaustive as string}`)
    }
  }
}
