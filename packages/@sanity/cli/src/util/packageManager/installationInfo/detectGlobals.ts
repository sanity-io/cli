import path from 'node:path'

import {execa} from 'execa'
import which from 'which'

import {type GlobalInstallation, type LockfileType, type SanityPackage} from './types.js'

const SANITY_PACKAGES: SanityPackage[] = ['sanity', '@sanity/cli']

/**
 * Tries to parse JSON from command output that may contain non-JSON prefix lines
 * (e.g. npm warnings printed before JSON). Returns null if parsing fails.
 */
function tryParseJson<T>(stdout: string): T | null {
  // First, try parsing the full output
  try {
    return JSON.parse(stdout) as T
  } catch {
    // Fall through
  }

  // Try to find the start of JSON content (first { or [)
  const jsonStart = stdout.search(/[{[]/)
  if (jsonStart > 0) {
    try {
      return JSON.parse(stdout.slice(jsonStart)) as T
    } catch {
      // Fall through
    }
  }

  return null
}

interface NpmListOutput {
  dependencies?: Record<
    string,
    {
      resolved?: string
      version: string
    }
  >
  /** Global lib directory (e.g. /usr/local/lib on Unix). */
  path?: string
}

interface NpmGlobalsResult {
  globals: GlobalInstallation[]
  /** npm's global lib directory, used to verify the active binary belongs to npm. */
  libDir: string | null
}

interface PnpmListProject {
  dependencies?: Record<string, {path?: string; version: string}>
  path?: string
}

/**
 * Detects global installations of sanity and \@sanity/cli across all package managers.
 * Runs queries in parallel for efficiency.
 */
export async function detectGlobalInstallations(): Promise<GlobalInstallation[]> {
  // Query all package managers in parallel
  const [activeBinaryPath, npmResult, pnpmResult, yarnGlobals, bunGlobals] = await Promise.all([
    // Find which binary is active in PATH
    findActiveBinaryPath(),
    queryNpmGlobals(),
    queryPnpmGlobals(),
    queryYarnGlobals(),
    queryBunGlobals(),
  ])

  const allGlobals = [...npmResult.globals, ...pnpmResult.globals, ...yarnGlobals, ...bunGlobals]

  // Mark which installation is active
  return markActiveInstallation(allGlobals, activeBinaryPath, npmResult.libDir, pnpmResult.binDir)
}

async function findActiveBinaryPath(): Promise<string | null> {
  try {
    return await which('sanity')
  } catch {
    return null
  }
}

async function queryNpmGlobals(): Promise<NpmGlobalsResult> {
  try {
    const result = await execa('npm', ['list', '-g', '--depth=0', '--json'], {
      reject: false,
      timeout: 10_000,
    })

    if (!result.stdout) {
      return {globals: [], libDir: null}
    }

    const output = tryParseJson<NpmListOutput>(result.stdout)
    if (!output) {
      return {globals: [], libDir: null}
    }

    const globals: GlobalInstallation[] = []

    for (const pkg of SANITY_PACKAGES) {
      const dep = output.dependencies?.[pkg]
      if (dep) {
        globals.push({
          isActive: false, // Will be set later
          packageManager: 'npm',
          packageName: pkg,
          // npm's `resolved` is a tarball URL, not a filesystem path.
          path: null,
          version: dep.version,
        })
      }
    }

    return {globals, libDir: output.path ?? null}
  } catch {
    return {globals: [], libDir: null}
  }
}

interface PnpmGlobalsResult {
  /** pnpm's global bin directory, used to verify the active binary belongs to pnpm. */
  binDir: string | null
  globals: GlobalInstallation[]
}

async function queryPnpmGlobals(): Promise<PnpmGlobalsResult> {
  try {
    // Query pnpm global bin dir and global packages in parallel
    const [binResult, listResult] = await Promise.all([
      execa('pnpm', ['bin', '-g'], {reject: false, timeout: 10_000}),
      execa('pnpm', ['list', '-g', '--depth=0', '--json'], {reject: false, timeout: 10_000}),
    ])

    const binDir = binResult.stdout?.trim() || null

    if (!listResult.stdout) {
      return {binDir, globals: []}
    }

    const output = tryParseJson<PnpmListProject[]>(listResult.stdout)
    if (!output) {
      return {binDir, globals: []}
    }

    const globals: GlobalInstallation[] = []

    for (const project of output) {
      if (!project.dependencies) continue
      for (const pkg of SANITY_PACKAGES) {
        const dep = project.dependencies[pkg]
        if (dep) {
          globals.push({
            isActive: false,
            packageManager: 'pnpm',
            packageName: pkg,
            path: dep.path || null,
            version: dep.version,
          })
        }
      }
    }

    return {binDir, globals}
  } catch {
    return {binDir: null, globals: []}
  }
}

async function queryYarnGlobals(): Promise<GlobalInstallation[]> {
  // `yarn global list` only works with Yarn Classic (v1).
  // Yarn Berry (v2+) removed global installs entirely — the command errors or
  // produces no output. Because `reject: false` is set, the call returns
  // empty stdout and we gracefully return []. This means Yarn Berry global
  // installations (if any exist via third-party plugins) are invisible here.
  // A version check (via getYarnMajorVersion) could skip the call entirely,
  // but since it already degrades gracefully the cost is just a failed exec.
  try {
    const result = await execa('yarn', ['global', 'list', '--json'], {
      reject: false,
      timeout: 10_000,
    })

    if (!result.stdout) {
      return []
    }

    // Yarn outputs NDJSON - one JSON object per line
    const globals: GlobalInstallation[] = []
    const lines = result.stdout.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as {data: string; type: string}
        if (entry.type === 'info' && entry.data) {
          // Yarn classic emits: "\"sanity@3.67.0\" has binaries:\n  - sanity"
          // Extract the quoted "package@version" portion.
          for (const pkg of SANITY_PACKAGES) {
            const prefix = `"${pkg}@`
            if (entry.data.startsWith(prefix)) {
              const closingQuote = entry.data.indexOf('"', prefix.length)
              if (closingQuote !== -1) {
                globals.push({
                  isActive: false,
                  packageManager: 'yarn',
                  packageName: pkg,
                  path: null,
                  version: entry.data.slice(prefix.length, closingQuote),
                })
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return globals
  } catch {
    return []
  }
}

// As of Bun 1.2, `bun pm ls` does not support --json or -g flags.
// Skip the subprocess call entirely to avoid wasted latency on every run.
// Re-enable when bun implements JSON output (see oven-sh/bun#26222).
async function queryBunGlobals(): Promise<GlobalInstallation[]> {
  return []
}

function markActiveInstallation(
  globals: GlobalInstallation[],
  activeBinaryPath: string | null,
  npmLibDir: string | null,
  pnpmBinDir: string | null,
): GlobalInstallation[] {
  if (!activeBinaryPath) {
    return globals
  }

  // Determine which package manager the active binary belongs to.
  // For npm and pnpm, we verify against their actual reported directories
  // rather than relying on path substring matching which breaks with
  // custom install locations.
  let activePackageManager: LockfileType | null = null

  // bun — check default ~/.bun/ path, then fall back to BUN_INSTALL env var
  // for users with a custom installation directory.
  if (isInBunDir(activeBinaryPath)) {
    activePackageManager = 'bun'
  }
  // pnpm — verify against pnpm's actual global bin dir from `pnpm bin -g`.
  // This works regardless of PNPM_HOME configuration.
  else if (pnpmBinDir && isInPnpmBinDir(activeBinaryPath, pnpmBinDir)) {
    activePackageManager = 'pnpm'
  }
  // yarn — unlike npm/pnpm, Yarn Classic has no reliable command to query its
  // global bin directory. `yarn global bin` exists but its output varies by
  // platform and configuration. Fall back to known path patterns.
  // TODO: Query `yarn global bin` for more accurate detection, similar to
  // how pnpm uses `pnpm bin -g`. Custom $YARN_DIR or non-standard install
  // locations will not be detected by these patterns.
  else if (
    activeBinaryPath.includes('/.yarn/') ||
    activeBinaryPath.includes('\\.yarn\\') ||
    activeBinaryPath.includes('/.config/yarn/')
  ) {
    activePackageManager = 'yarn'
  }
  // npm — verify the binary is actually in npm's global bin directory.
  // `npm list -g --json` reports a `path` (the global lib dir, e.g. /usr/local/lib).
  // On Unix, bins are at <prefix>/bin (sibling of lib). On Windows, bins are in
  // the same directory as lib. When npmLibDir is null (npm didn't report a path),
  // we can't verify — leave activePackageManager as null rather than guessing,
  // since incorrectly marking npm as active could misclassify local installs.
  else if (npmLibDir && isInNpmBinDir(activeBinaryPath, npmLibDir)) {
    activePackageManager = 'npm'
  }

  return globals.map((g) => ({
    ...g,
    // Mark as active if it's from the detected package manager.
    // Both `sanity` and `@sanity/cli` provide a `sanity` binary,
    // so either package from the active pm is considered active.
    isActive: g.packageManager === activePackageManager,
  }))
}

/**
 * Checks whether a binary path is inside pnpm's global bin directory.
 * `pnpm bin -g` returns the directory where global binaries are linked.
 */
function isInPnpmBinDir(binaryPath: string, pnpmBinDir: string): boolean {
  const binaryDir = path.dirname(path.normalize(binaryPath))
  return binaryDir === path.normalize(pnpmBinDir)
}

/**
 * Checks whether a binary path is inside npm's global bin directory.
 * On Unix: lib is at `<prefix>/lib`, bins at `<prefix>/bin` (sibling dirs).
 * On Windows: lib and bins share the same directory.
 */
function isInBunDir(binaryPath: string): boolean {
  // Default ~/.bun/ location
  if (binaryPath.includes('/.bun/') || binaryPath.includes('\\.bun\\')) {
    return true
  }
  // Custom BUN_INSTALL directory (e.g. BUN_INSTALL=/opt/bun)
  const bunInstall = process.env.BUN_INSTALL
  if (bunInstall) {
    const binaryDir = path.dirname(path.normalize(binaryPath))
    const bunBinDir = path.join(path.normalize(bunInstall), 'bin')
    if (binaryDir === bunBinDir) {
      return true
    }
  }
  return false
}

function isInNpmBinDir(binaryPath: string, npmLibDir: string): boolean {
  // Normalize paths first — on Windows, path.dirname preserves forward slashes
  // but path.join converts to backslashes, causing mismatches without this.
  const binaryDir = path.dirname(path.normalize(binaryPath))
  const normalizedLibDir = path.normalize(npmLibDir)
  // Unix: bins at <prefix>/bin, lib at <prefix>/lib → sibling directories
  const unixBinDir = path.join(path.dirname(normalizedLibDir), 'bin')
  // Windows: bins and lib share the same directory
  return binaryDir === unixBinDir || binaryDir === normalizedLibDir
}
