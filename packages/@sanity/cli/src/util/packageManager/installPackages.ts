import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {execa, type Options} from 'execa'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'
import {parseIgnoredBuilds} from './pnpmBuildApproval.js'

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
): Promise<{ignoredBuilds: string[]}> {
  const progress = spinner(`Running ${packageManager} ${args.join(' ')}\n`).start()

  const result = await execa(packageManager, args, execOptions)

  if (result?.exitCode || result?.failed) {
    const combinedOutput = `${String(result?.stdout ?? '')}\n${String(result?.stderr ?? '')}`
    const ignoredBuilds = packageManager === 'pnpm' ? parseIgnoredBuilds(combinedOutput) : []

    // pnpm 11 exits non-zero when build scripts are skipped, even though the
    // install itself succeeded. Treat this as success and surface the affected
    // dependencies to the caller so they can be reported at the end of init.
    if (ignoredBuilds.length > 0) {
      progress.succeed()
      return {ignoredBuilds}
    }

    progress.fail()
    output.log(String(result.stdout))
    output.error(errorMessage, {exit: 1})
    return {ignoredBuilds: []}
  }

  progress.succeed()
  return {ignoredBuilds: []}
}

export async function installDeclaredPackages(
  cwd: string,
  packageManager: PackageManager,
  context: {output: Output; workDir: string},
): Promise<{ignoredBuilds: string[]}> {
  const {output} = context
  const execOptions: Options = {
    cwd,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(cwd),
    reject: false,
    stdio: 'pipe',
  }

  if (packageManager === 'manual') {
    const npmCommand = PACKAGE_MANAGER_COMMANDS.install.npm
    output.log(`Manual installation selected — run 'npm ${npmCommand.join(' ')}' or equivalent`)
    return {ignoredBuilds: []}
  }

  const args = PACKAGE_MANAGER_COMMANDS.install[packageManager]
  return executePackageManagerCommand(
    packageManager,
    args,
    execOptions,
    output,
    'Dependency installation failed',
  )
}

export async function installNewPackages(
  options: InstallOptions,
  context: {output: Output; workDir: string},
): Promise<{ignoredBuilds: string[]}> {
  const {packageManager, packages} = options
  const {output, workDir} = context
  const execOptions: Options = {
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    reject: false,
    stdio: 'pipe',
  }

  if (packageManager === 'manual') {
    const npmCommand = PACKAGE_MANAGER_COMMANDS.add.npm(packages)
    output.log(`Manual installation selected - run 'npm ${npmCommand.join(' ')}' or equivalent`)
    return {ignoredBuilds: []}
  }

  const args = PACKAGE_MANAGER_COMMANDS.add[packageManager](packages)
  return executePackageManagerCommand(
    packageManager,
    args,
    execOptions,
    output,
    'Package installation failed',
  )
}
