import {spawn} from 'node:child_process'
import {accessSync, constants} from 'node:fs'
import path from 'node:path'
import {styleText} from 'node:util'

// Shared, dependency-free detection logic, bundled at build time
import {preferredPm} from '../../@sanity/cli/src/util/packageManager/preferredPm.js'
import {InitError, output, select, spinner} from './ui.js'

export type PackageManager = 'bun' | 'manual' | 'npm' | 'pnpm' | 'yarn'
type Installer = Exclude<PackageManager, 'manual'>

const EXPERIMENTAL = new Set(['bun'])

function pathKey(): string {
  if (process.platform !== 'win32') return 'PATH'
  return (
    Object.keys(process.env)
      .toReversed()
      .find((key) => key.toUpperCase() === 'PATH') || 'Path'
  )
}

/** `PATH` with every `node_modules/.bin` up the tree and Node's own directory, like npm scripts */
function npmRunPath(cwd: string): string {
  const result: string[] = []
  let previous
  let dir = path.resolve(cwd)
  while (previous !== dir) {
    result.push(path.join(dir, 'node_modules', '.bin'))
    previous = dir
    dir = path.resolve(dir, '..')
  }
  result.push(path.dirname(process.execPath))
  return [...result, process.env[pathKey()]].join(path.delimiter)
}

export function hasCommand(cmd: string, cwd: string): boolean {
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  for (const dir of npmRunPath(cwd).split(path.delimiter)) {
    if (!dir) continue
    for (const ext of extensions) {
      try {
        accessSync(path.join(dir, cmd + ext), constants.X_OK)
        return true
      } catch {
        // keep looking
      }
    }
  }
  return false
}

function runningPackageManager(): Installer | undefined {
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.includes('pnpm')) return 'pnpm'
  if (ua.includes('yarn')) return 'yarn'
  if (ua.includes('bun')) return 'bun'
  if (/^npm\/\d/.test(ua)) return 'npm'
  return undefined
}

/** Pick a package manager the way `sanity init` does */
export async function resolvePackageManager(options: {
  interactive: boolean
  packageManager: PackageManager | undefined
  targetDir: string
}): Promise<PackageManager> {
  const {interactive, packageManager, targetDir} = options
  if (packageManager) return packageManager

  const preferred = preferredPm(targetDir) ?? undefined
  if (preferred && hasCommand(preferred, targetDir)) return preferred

  const installed = (['npm', 'yarn', 'pnpm', 'bun'] as const).filter((pm) =>
    hasCommand(pm, targetDir),
  )
  const running = runningPackageManager()
  const mostLikely = running && installed.includes(running) ? running : undefined
  if (!interactive) return mostLikely || installed[0] || 'manual'

  const suffix = preferred ? ` (preferred is ${preferred}, but is not installed)` : ''
  return select<PackageManager>({
    choices: [...installed, 'manual' as const].map((pm) => ({
      name: EXPERIMENTAL.has(pm) ? `${pm} (experimental)` : pm,
      value: pm,
    })),
    default: preferred || mostLikely,
    message: `Package manager to use for installing dependencies?${suffix}`,
  })
}

export function getInstallCommand(packageManager: PackageManager): string {
  return `${packageManager === 'manual' ? 'npm' : packageManager} install`
}

const IGNORED_BUILDS_PATTERN =
  /ERR_PNPM_IGNORED_BUILDS.*?Ignored build scripts: ?((?:[^\s,]+@[^\s,]+[, ]*)+)/

export function getIgnoredBuildScripts(commandOutput: string): string[] | undefined {
  const match = commandOutput.replaceAll(/\s+/g, ' ').match(IGNORED_BUILDS_PATTERN)
  if (!match) return undefined
  return match[1]
    .split(/[\s,]+/)
    .map((entry) => entry.replace(/\.$/, ''))
    .filter(Boolean)
}

function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{code: number; output: string}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {...process.env, [pathKey()]: npmRunPath(cwd)},
      // npm/pnpm/yarn are `.cmd` shims on Windows
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({code: code ?? 1, output: text}))
  })
}

export async function installDependencies(
  cwd: string,
  packageManager: PackageManager,
): Promise<void> {
  if (packageManager === 'manual') {
    output.log(`Manual installation selected — run '${getInstallCommand('manual')}' or equivalent`)
    return
  }
  const progress = spinner(`Running ${packageManager} install\n`).start()
  let result: {code: number; output: string}
  try {
    result = await run(packageManager, ['install'], cwd)
  } catch (error) {
    progress.fail()
    throw error
  }
  if (result.code === 0) {
    progress.succeed()
    return
  }
  // pnpm exits non-zero when it skips dependency build scripts, though the install succeeded
  const ignored = packageManager === 'pnpm' ? getIgnoredBuildScripts(result.output) : undefined
  if (ignored) {
    progress.succeed()
    if (ignored.some((entry) => entry.replace(/@[^@]+$/, '') !== 'esbuild')) {
      output.warn(
        'pnpm skipped build scripts for some dependencies. Run "pnpm approve-builds" in the project directory to pick which dependencies should be allowed to run scripts.',
      )
    }
    return
  }
  progress.fail()
  output.log(result.output)
  throw new InitError(styleText('red', 'Dependency installation failed'))
}
