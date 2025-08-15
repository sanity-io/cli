import {type Output, spinner} from '@sanity/cli-core'
import {execa, type Options, type Result} from 'execa'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'

/**
 * @internal
 */
interface InstallOptions {
  packageManager: PackageManager
  packages: string[]
}

export async function installDeclaredPackages(
  cwd: string,
  packageManager: PackageManager,
  context: {output: Output; workDir: string},
): Promise<void> {
  const {output} = context
  const execOptions: Options = {
    cwd,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(cwd),
    stdio: 'pipe',
  }

  // results of running execa with the selected package manager
  let result: Result | undefined

  type PackageManagerLibs = Exclude<PackageManager, 'manual'>
  type InstallerArgs = {[key in PackageManagerLibs]: string[]}

  const installerArgs: InstallerArgs = {
    bun: ['install'],
    npm: ['install', '--legacy-peer-deps'],
    pnpm: ['install'],
    yarn: ['install'],
  }

  async function handleInstall(cmd: PackageManager, args: InstallerArgs[PackageManagerLibs]) {
    // Start a spinner for the install process
    const progress = spinner(`Running ${cmd} ${args.join(' ')}\n`).start()

    // Perform the install command with execa
    result = await execa(cmd, args, execOptions)

    // If the install fails, log execa's stdout and throw…
    if (result?.exitCode || result?.failed) {
      progress.fail()
      output.log(String(result.stdout))
      throw new Error('Dependency installation failed')
    } else {
      // …otherwise, just mark the install as successful
      progress.succeed()
    }
  }

  if (packageManager === 'manual') {
    output.log(`Manual installation selected — run 'npm ${installerArgs.npm.join(' ')}' or equivalent`)
  } else {
    await handleInstall(packageManager, installerArgs[packageManager])
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
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'pipe',
  }

  // results of running execa with the selected package manager
  let result: Result | undefined

  type PackageManagerLibs = Exclude<PackageManager, 'manual'>
  type NewPackageArgs = {[key in PackageManagerLibs]: string[]}

  const newPackageArgs: NewPackageArgs = {
    bun: ['add', ...packages],
    npm: ['install', '--legacy-peer-deps', '--save', ...packages],
    pnpm: ['add', '--save-prod', ...packages],
    yarn: ['add', ...packages],
  }

  async function handleInstallNew(cmd: PackageManager, args: NewPackageArgs[PackageManagerLibs]) {
    // Start a spinner for the install process
    const progress = spinner(`Running ${cmd} ${args.join(' ')}\n`).start()

    // Perform the install command with execa
    result = await execa(cmd, args, execOptions)

    // If the install fails, log execa's stdout and throw…
    if (result?.exitCode || result?.failed) {
      progress.fail()
      output.log(String(result.stdout))
      throw new Error('Package installation failed')
    } else {
      // …otherwise, just mark the install as successful
      progress.succeed()
    }
  }

  if (packageManager === 'manual') {
    output.log(`Manual installation selected - run 'npm ${newPackageArgs.npm.join(' ')}' or equivalent`)
  } else {
    await handleInstallNew(packageManager, newPackageArgs[packageManager])
  }
}
