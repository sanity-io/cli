import {CLIError} from '@oclif/core/errors'
import {exitCodes, type Output} from '@sanity/cli-core'
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

/**
 * Extracts the package spec a package manager could not resolve, eg
 * `@typescript-eslint/scope-manager@8.67.0`, from install output.
 *
 * npm scans newly published packages before they become installable, so a version can be
 * tagged `latest` minutes before any client can resolve it - and a package that pins its
 * siblings to exact versions is unresolvable for as long as one of them is still pending.
 * Every package manager reports this as a plain "no matching version" failure, which reads
 * like a broken dependency rather than a transient registry state.
 *
 * @see https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/
 */
function getUnavailableVersion(commandOutput: string): string | undefined {
  // Package managers wrap these messages, so match against whitespace-normalized output
  const output = commandOutput.replaceAll(/\s+/g, ' ')

  // pnpm: `ERR_PNPM_NO_MATCHING_VERSION No matching version found for <spec> while fetching…`
  // npm: `npm error notarget No matching version found for <spec>.`
  const noMatchingVersion = output.match(/No matching version found for (\S+)/)
  if (noMatchingVersion) {
    // npm ends the sentence here, pnpm continues, so only npm leaves trailing punctuation
    return noMatchingVersion[1].replace(/[.,]+$/, '')
  }

  // yarn: `Couldn't find any versions for "<name>" that matches "<range>"`
  const yarnNoVersions = output.match(
    /Couldn't find any versions for "([^"]+)" that matches "([^"]+)"/,
  )
  if (yarnNoVersions) {
    return `${yarnNoVersions[1]}@${yarnNoVersions[2]}`
  }

  // bun: `error: No version matching "<range>" found for specifier "<name>"`
  const bunNoVersion = output.match(/No version matching "([^"]+)" found for specifier "([^"]+)"/)
  if (bunNoVersion) {
    return `${bunNoVersion[2]}@${bunNoVersion[1]}`
  }

  return undefined
}

function getUnavailableVersionNotice(spec: string, command: string, cwd: Options['cwd']): string {
  const location = typeof cwd === 'string' ? ` in ${cwd}` : ''
  return [
    `${spec} isn't available from the npm registry yet.`,
    'New releases are scanned before they become installable, which usually takes a few minutes.',
    `Run '${command}'${location} again shortly, or check that the version exists on npm.`,
  ].join(' ')
}

async function executePackageManagerCommand(
  packageManager: PackageManagerLibs,
  args: string[],
  execOptions: Options,
  output: Output,
  errorMessage: string,
): Promise<void> {
  const progress = spinner({
    discardStdin: !execOptions.cancelSignal,
    text: `Running ${packageManager} ${args.join(' ')}\n`,
  }).start()
  let progressSettled = false
  const fail = () => {
    progressSettled = true
    progress.fail()
  }
  const succeed = () => {
    progressSettled = true
    progress.succeed()
  }

  try {
    const result = await execa(packageManager, args, execOptions)

    if (execOptions.cancelSignal?.aborted) {
      fail()
      execOptions.cancelSignal.throwIfAborted()
    }

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
        succeed()
        if (ignoredBuilds.some((entry) => !isEsbuild(entry))) {
          output.warn(IGNORED_BUILDS_NOTICE)
        }
        return
      }

      fail()
      // Log both streams - package managers often print the actionable error
      // details to stderr, so logging stdout alone can hide the failure reason.
      output.log(commandOutput)

      const unavailableVersion = getUnavailableVersion(commandOutput)
      if (unavailableVersion) {
        output.warn(
          getUnavailableVersionNotice(
            unavailableVersion,
            `${packageManager} ${args.join(' ')}`,
            execOptions.cwd,
          ),
        )
      }

      throw new CLIError(errorMessage, {exit: exitCodes.RUNTIME_ERROR})
    } else {
      succeed()
    }
  } catch (err) {
    if (!progressSettled) {
      fail()
    }
    throw err
  } finally {
    progress.stop()
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
  context: {cancelSignal?: AbortSignal; output: Output; timeout?: number; workDir: string},
): Promise<void> {
  const {packageManager, packages} = options
  const {cancelSignal, output, timeout, workDir} = context
  const execOptions: Options = {
    cancelSignal,
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    reject: false,
    stdio: 'pipe',
    timeout,
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
