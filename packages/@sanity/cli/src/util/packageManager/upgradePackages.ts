import {type Command} from '@oclif/core'
import {execa, type Options, type Result} from 'execa'

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
  context: {output: {log: Command['log']}; workDir: string},
): Promise<void> {
  const {packageManager, packages} = options
  const {output, workDir} = context
  const execOptions: Options = {
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'inherit',
  }
  const upgradePackageArgs = packages.map((pkg) => pkg.join('@'))
  const npmArgs = ['upgrade', '--legacy-peer-deps', ...upgradePackageArgs]
  let result: Result | undefined
  switch (packageManager) {
    case 'bun': {
      const bunArgs = ['update', ...upgradePackageArgs]
      output.log(`Running 'bun ${bunArgs.join(' ')}'`)
      result = await execa('bun', bunArgs, execOptions)

      break
    }
    case 'manual': {
      output.log(
        `Manual installation selected - run 'npm upgrade ${upgradePackageArgs.join(' ')}' or equivalent`,
      )

      break
    }
    case 'npm': {
      output.log(`Running 'npm upgrade ${npmArgs.join(' ')}'`)
      result = await execa('npm', npmArgs, execOptions)

      break
    }
    case 'pnpm': {
      const pnpmArgs = ['upgrade', ...upgradePackageArgs]
      output.log(`Running 'pnpm ${pnpmArgs.join(' ')}'`)
      result = await execa('pnpm', pnpmArgs, execOptions)

      break
    }
    case 'yarn': {
      const yarnArgs = ['upgrade ', ...upgradePackageArgs]
      output.log(`Running 'yarn ${yarnArgs.join(' ')}'`)
      result = await execa('yarn', yarnArgs, execOptions)

      break
    }
    // No default
  }

  if (result?.exitCode || result?.failed) {
    throw new Error('Package upgrade failed')
  }
}
