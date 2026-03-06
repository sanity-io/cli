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
  const [activeBinaryPath, npmGlobals, pnpmGlobals, yarnGlobals, bunGlobals] = await Promise.all([
    // Find which binary is active in PATH
    findActiveBinaryPath(),
    queryNpmGlobals(),
    queryPnpmGlobals(),
    queryYarnGlobals(),
    queryBunGlobals(),
  ])

  const allGlobals = [...npmGlobals, ...pnpmGlobals, ...yarnGlobals, ...bunGlobals]

  // Mark which installation is active
  return markActiveInstallation(allGlobals, activeBinaryPath)
}

async function findActiveBinaryPath(): Promise<string | null> {
  try {
    return await which('sanity')
  } catch {
    return null
  }
}

async function queryNpmGlobals(): Promise<GlobalInstallation[]> {
  try {
    const result = await execa('npm', ['list', '-g', '--depth=0', '--json'], {
      reject: false,
      timeout: 10_000,
    })

    if (!result.stdout) {
      return []
    }

    const output = tryParseJson<NpmListOutput>(result.stdout)
    if (!output) {
      return []
    }

    const globals: GlobalInstallation[] = []

    for (const pkg of SANITY_PACKAGES) {
      const dep = output.dependencies?.[pkg]
      if (dep) {
        globals.push({
          isActive: false, // Will be set later
          packageManager: 'npm',
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
  // Yarn classic uses `yarn global list`
  // Yarn berry has different global handling
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
): GlobalInstallation[] {
  if (!activeBinaryPath) {
    return globals
  }

  // Determine which package manager the active binary belongs to
  // by checking path patterns. Check specific pm patterns first, then
  // fall back to npm if the path doesn't match any — npm binaries end up
  // in generic locations (nvm, homebrew, custom prefix) that can't be
  // pattern-matched, so we treat "unrecognised path" as npm when npm
  // globals exist.
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
    activeBinaryPath.includes('/yarn/') ||
    activeBinaryPath.includes('\\.yarn\\') ||
    activeBinaryPath.includes('/.config/yarn/')
  ) {
    activePackageManager = 'yarn'
  }
  // npm fallback — npm installs binaries to generic system paths
  // (e.g. ~/.nvm/versions/node/*/bin/, /opt/homebrew/bin/, /usr/local/bin/)
  // that aren't distinguishable by pattern. If no other pm matched and
  // npm globals were found, assume npm.
  else if (globals.some((g) => g.packageManager === 'npm')) {
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
