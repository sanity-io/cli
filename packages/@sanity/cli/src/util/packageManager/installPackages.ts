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
    output.log(`Manual installation selected — run 'npm ${installerArgs.npm} or equivalent'`)
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
    stdio: 'inherit',
  }

  const npmArgs = ['install', '--legacy-peer-deps', '--save', ...packages]
  let result: Result<Options> | undefined
  switch (packageManager) {
    case 'bun': {
      const bunArgs = ['add', ...packages]
      output.log(`Running 'bun ${bunArgs.join(' ')}'`)
      result = await execa('bun', bunArgs, execOptions)

      break
    }
    case 'manual': {
      output.log(`Manual installation selected - run 'npm ${npmArgs.join(' ')}' or equivalent`)

      break
    }
    case 'npm': {
      output.log(`Running 'npm ${npmArgs.join(' ')}'`)
      result = await execa('npm', npmArgs, execOptions)

      break
    }
    case 'pnpm': {
      const pnpmArgs = ['add', '--save-prod', ...packages]
      output.log(`Running 'pnpm ${pnpmArgs.join(' ')}'`)
      result = await execa('pnpm', pnpmArgs, execOptions)

      break
    }
    case 'yarn': {
      const yarnArgs = ['add', ...packages]
      output.log(`Running 'yarn ${yarnArgs.join(' ')}'`)
      result = await execa('yarn', yarnArgs, execOptions)

      break
    }
    // No default
  }

  if (result?.exitCode || result?.failed) {
    throw new Error('Package installation failed')
  }
}
