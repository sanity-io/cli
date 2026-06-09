import {type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {execa, type Options} from 'execa'

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

const IGNORED_BUILDS_NOTICE =
  'pnpm skipped build scripts for some dependencies. Run "pnpm approve-builds" in the project directory to pick which dependencies should be allowed to run scripts.'

// Matches pnpm's `ERR_PNPM_IGNORED_BUILDS` error against whitespace-normalized
// output (pnpm may wrap the message), capturing the list of skipped packages,
// eg `esbuild@0.25.0, sharp@0.34.0.` - the `<pkg>@<version>` token sequence
// ends the capture where the trailing `Run "pnpm approve-builds"…` hint starts
const IGNORED_BUILDS_PATTERN =
  /ERR_PNPM_IGNORED_BUILDS.*?Ignored build scripts: ?((?:[^\s,]+@[^\s,]+[, ]*)+)/

function getIgnoredBuildScripts(commandOutput: string): string[] | undefined {
  const match = commandOutput.replaceAll(/\s+/g, ' ').match(IGNORED_BUILDS_PATTERN)
  if (!match) {
    return undefined
  }

  // The capture allows both comma and whitespace separators (pnpm may print
  // either, and wrapping can drop the comma), so split on both.
  return match[1]
    .split(/[\s,]+/)
    .map((entry) => entry.replace(/\.$/, ''))
    .filter(Boolean)
}

function isEsbuild(ignoredEntry: string): boolean {
  // Entries are on the form `<pkg-name>@<version>` - strip the version,
  // keeping in mind that scoped package names also start with `@`
  return ignoredEntry.replace(/@[^@]+$/, '') === 'esbuild'
}

async function executePackageManagerCommand(
  packageManager: PackageManagerLibs,
  args: string[],
  execOptions: Options,
  output: Output,
  errorMessage: string,
): Promise<void> {
  const progress = spinner(`Running ${packageManager} ${args.join(' ')}\n`).start()

  const result = await execa(packageManager, args, execOptions)

  if (result?.exitCode || result?.failed) {
    // pnpm exits non-zero if dependency build scripts were skipped, even though
    // the install itself succeeded. Treat it as a success, but point to
    // `pnpm approve-builds` if anything other than esbuild was skipped
    // (esbuild works without its build script through a JS fallback).
    const commandOutput = [result.stdout, result.stderr]
      .filter((chunk): chunk is string => typeof chunk === 'string')
      .join('\n')
    const ignoredBuilds =
      packageManager === 'pnpm' ? getIgnoredBuildScripts(commandOutput) : undefined

    if (ignoredBuilds) {
      progress.succeed()
      if (ignoredBuilds.some((entry) => !isEsbuild(entry))) {
        output.warn(IGNORED_BUILDS_NOTICE)
      }
      return
    }

    progress.fail()
    // Log both streams - package managers often print the actionable error
    // details to stderr, so logging stdout alone can hide the failure reason.
    output.log(commandOutput)
    output.error(errorMessage, {exit: 1})
  } else {
    progress.succeed()
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
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(cwd),
    reject: false,
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
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    reject: false,
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
