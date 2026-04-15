import {type Output} from '@sanity/cli-core'
import {getYarnMajorVersion} from '@sanity/cli-core/package-manager'
import spawn, {type Options} from 'nano-spawn'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'

/**
 * @internal
 */
interface UpgradeOptions {
  packageManager: PackageManager
  packages: [name: string, version: string][]
}

/**
 * @internal
 */
export async function upgradePackages(
  options: UpgradeOptions,
  context: {output: Output; workDir: string},
): Promise<void> {
  const {packageManager, packages} = options
  const {output, workDir} = context
  const execOptions: Options = {
    cwd: workDir,
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'inherit',
  }
  const upgradePackageArgs = packages.map((pkg) => pkg.join('@'))
  switch (packageManager) {
    case 'bun': {
      const bunArgs = ['update', ...upgradePackageArgs]
      output.log(`Running 'bun ${bunArgs.join(' ')}'`)
      await spawn('bun', bunArgs, execOptions)

      break
    }
    case 'manual': {
      output.log(
        `Manual installation selected - run 'npm upgrade ${upgradePackageArgs.join(' ')}' or equivalent`,
      )

      break
    }
    case 'npm': {
      const npmArgs = ['install', '--legacy-peer-deps', ...upgradePackageArgs]
      output.log(`Running 'npm ${npmArgs.join(' ')}'`)
      await spawn('npm', npmArgs, execOptions)

      break
    }
    case 'pnpm': {
      const pnpmArgs = ['upgrade', ...upgradePackageArgs]
      output.log(`Running 'pnpm ${pnpmArgs.join(' ')}'`)
      await spawn('pnpm', pnpmArgs, execOptions)

      break
    }
    case 'yarn': {
      const yarnMajor = getYarnMajorVersion()
      const upgradeCmd = yarnMajor !== undefined && yarnMajor >= 2 ? 'up' : 'upgrade'
      const yarnArgs = [upgradeCmd, ...upgradePackageArgs]
      output.log(`Running 'yarn ${yarnArgs.join(' ')}'`)
      await spawn('yarn', yarnArgs, execOptions)

      break
    }
    // No default
  }
}
