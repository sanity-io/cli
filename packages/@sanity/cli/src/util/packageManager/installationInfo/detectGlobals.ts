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
  const [activeBinaryPath, npmResult, pnpmGlobals, yarnGlobals, bunGlobals] = await Promise.all([
    // Find which binary is active in PATH
    findActiveBinaryPath(),
    queryNpmGlobals(),
    queryPnpmGlobals(),
    queryYarnGlobals(),
    queryBunGlobals(),
  ])

  const allGlobals = [...npmResult.globals, ...pnpmGlobals, ...yarnGlobals, ...bunGlobals]

  // Mark which installation is active
  return markActiveInstallation(allGlobals, activeBinaryPath, npmResult.libDir)
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

async function queryPnpmGlobals(): Promise<GlobalInstallation[]> {
  try {
    const result = await execa('pnpm', ['list', '-g', '--depth=0', '--json'], {
      reject: false,
      timeout: 10_000,
    })

    if (!result.stdout) {
      return []
    }

    const output = tryParseJson<PnpmListProject[]>(result.stdout)
    if (!output) {
      return []
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

    return globals
  } catch {
    return []
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

interface BunListOutput {
  dependencies?: Record<
    string,
    {
      resolved: string
      version: string
    }
  >
}

// NOTE: As of Bun 1.2, `bun pm ls` does not support --json or -g flags.
// The --json flag is parsed but not implemented (see oven-sh/bun#26222).
// This function will silently return [] until bun adds JSON output support,
// which is the intended graceful degradation.
async function queryBunGlobals(): Promise<GlobalInstallation[]> {
  try {
    const result = await execa('bun', ['pm', 'ls', '-g', '--json'], {
      reject: false,
      timeout: 10_000,
    })

    if (!result.stdout) {
      return []
    }

    const output = tryParseJson<BunListOutput>(result.stdout)
    if (!output) {
      return []
    }

    const globals: GlobalInstallation[] = []

    for (const pkg of SANITY_PACKAGES) {
      const dep = output.dependencies?.[pkg]
      if (dep) {
        globals.push({
          isActive: false,
          packageManager: 'bun',
          packageName: pkg,
          path: dep.resolved || null,
          version: dep.version,
        })
      }
    }

    return globals
  } catch {
    return []
  }
}

function markActiveInstallation(
  globals: GlobalInstallation[],
  activeBinaryPath: string | null,
  npmLibDir: string | null,
): GlobalInstallation[] {
  if (!activeBinaryPath) {
    return globals
  }

  // Determine which package manager the active binary belongs to
  // by checking path patterns. Check specific pm patterns first, then
  // verify against npm's actual global bin directory.
  let activePackageManager: LockfileType | null = null

  // bun patterns — check before pnpm/yarn since bun paths are distinctive
  if (activeBinaryPath.includes('/.bun/') || activeBinaryPath.includes('\\.bun\\')) {
    activePackageManager = 'bun'
  }
  // pnpm patterns
  else if (
    activeBinaryPath.includes('/pnpm/') ||
    activeBinaryPath.includes('\\.pnpm\\') ||
    activeBinaryPath.includes('\\pnpm\\') ||
    activeBinaryPath.includes('/.pnpm-global/') ||
    activeBinaryPath.includes('\\.pnpm-global\\')
  ) {
    activePackageManager = 'pnpm'
  }
  // yarn patterns
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
  // the same directory as lib. If we can't determine the bin dir (no path in output),
  // fall back to assuming npm when npm globals exist.
  else if (npmLibDir ? isInNpmBinDir(activeBinaryPath, npmLibDir) : hasNpmGlobals(globals)) {
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

function hasNpmGlobals(globals: GlobalInstallation[]): boolean {
  return globals.some((g) => g.packageManager === 'npm')
}

/**
 * Checks whether a binary path is inside npm's global bin directory.
 * On Unix: lib is at `<prefix>/lib`, bins at `<prefix>/bin` (sibling dirs).
 * On Windows: lib and bins share the same directory.
 */
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
