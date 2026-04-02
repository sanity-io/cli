import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import spawn, {type Options, type SubprocessError} from 'nano-spawn'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'

type PackageManagerLibs = Exclude<PackageManager, 'manual'>

/**
 * @internal
 */
interface InstallOptions {
  packageManager: PackageManager
  packages: string[]
}

interface PackageManagerCommands {
  add: {[key in PackageManagerLibs]: (packages: string[]) => string[]}
  install: {[key in PackageManagerLibs]: string[]}
}

const PACKAGE_MANAGER_COMMANDS: PackageManagerCommands = {
  add: {
    bun: (packages) => ['add', ...packages],
    npm: (packages) => ['install', '--save', ...packages],
    pnpm: (packages) => ['add', '--save-prod', ...packages],
    yarn: (packages) => ['add', ...packages],
  },
  install: {
    bun: ['install'],
    npm: ['install'],
    pnpm: ['install'],
    yarn: ['install'],
  },
}

async function executePackageManagerCommand(
  packageManager: PackageManagerLibs,
  args: string[],
  execOptions: Options,
  output: Output,
  errorMessage: string,
): Promise<void> {
  const progress = spinner(`Running ${packageManager} ${args.join(' ')}\n`).start()

  try {
    await spawn(packageManager, args, execOptions)
    progress.succeed()
  } catch (error) {
    progress.fail()
    output.log((error as SubprocessError).stdout)
    output.error(errorMessage, {exit: 1})
  }
}

export async function installDeclaredPackages(
  cwd: string,
  packageManager: PackageManager,
  context: {output: Output; workDir: string},
): Promise<void> {
  const {output} = context
  const execOptions: Options = {
    cwd,
    env: getPartialEnvWithNpmPath(cwd),
    stdio: 'pipe',
  }

  if (packageManager === 'manual') {
    const npmCommand = PACKAGE_MANAGER_COMMANDS.install.npm
    output.log(`Manual installation selected — run 'npm ${npmCommand.join(' ')}' or equivalent`)
  } else {
    const args = PACKAGE_MANAGER_COMMANDS.install[packageManager]
    await executePackageManagerCommand(
      packageManager,
      args,
      execOptions,
      output,
      'Dependency installation failed',
    )
  }
}

export async function installNewPackages(
  options: InstallOptions,
  context: {output: Output; workDir: string},
): Promise<void> {
  const {packageManager, packages} = options
  const {output, workDir} = context
  const execOptions: Options = {
    cwd: workDir,
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'pipe',
  }

  if (packageManager === 'manual') {
    const npmCommand = PACKAGE_MANAGER_COMMANDS.add.npm(packages)
    output.log(`Manual installation selected - run 'npm ${npmCommand.join(' ')}' or equivalent`)
  } else {
    const args = PACKAGE_MANAGER_COMMANDS.add[packageManager](packages)
    await executePackageManagerCommand(
      packageManager,
      args,
      execOptions,
      output,
      'Package installation failed',
    )
  }
}
