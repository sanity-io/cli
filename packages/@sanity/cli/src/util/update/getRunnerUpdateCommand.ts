import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {type TemporaryPackageRunner} from './isTemporaryPackageRunner.js'

export function getRunnerUpdateCommand(
  runner: TemporaryPackageRunner,
  packageName: SanityPackage,
): string {
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
      // yarn dlx needs `-p` when the package name differs from the bin name
      return `yarn dlx -p ${packageName}@latest sanity`
    }
    default: {
      const _exhaustive: never = runner
      throw new Error(`Unknown runner: ${_exhaustive as string}`)
    }
  }
}
