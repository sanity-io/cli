import {execa} from 'execa'
import which from 'which'

import {type GlobalInstallation, type PackageManager, type SanityPackage} from './types.js'

const SANITY_PACKAGES: SanityPackage[] = ['sanity', '@sanity/cli']

interface NpmListOutput {
  dependencies?: Record<
    string,
    {
      resolved?: string
      version: string
    }
  >
}

interface PnpmListItem {
  name: string
  version: string

  path?: string
}

/**
 * Detects global installations of sanity and \@sanity/cli across all package managers.
 * Runs queries in parallel for efficiency.
 */
export async function detectGlobalInstallations(): Promise<GlobalInstallation[]> {
  // Find which binary is active in PATH
  const activeBinaryPath = await findActiveBinaryPath()

  // Query all package managers in parallel
  const [npmGlobals, pnpmGlobals, yarnGlobals] = await Promise.all([
    queryNpmGlobals(),
    queryPnpmGlobals(),
    queryYarnGlobals(),
  ])

  const allGlobals = [...npmGlobals, ...pnpmGlobals, ...yarnGlobals]

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

    const output = JSON.parse(result.stdout) as NpmListOutput
    const globals: GlobalInstallation[] = []

    for (const pkg of SANITY_PACKAGES) {
      const dep = output.dependencies?.[pkg]
      if (dep) {
        globals.push({
          isActive: false, // Will be set later
          packageManager: 'npm',
          packageName: pkg,
          path: dep.resolved || getNpmGlobalPath(pkg),
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

    const output = JSON.parse(result.stdout) as PnpmListItem[]
    const globals: GlobalInstallation[] = []

    for (const item of output) {
      if (SANITY_PACKAGES.includes(item.name as SanityPackage)) {
        globals.push({
          isActive: false,
          packageManager: 'pnpm',
          packageName: item.name as SanityPackage,
          path: item.path || getPnpmGlobalPath(item.name),
          version: item.version,
        })
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
          // Parse "package@version" format
          for (const pkg of SANITY_PACKAGES) {
            const pattern = new RegExp(`^${pkg.replace('/', String.raw`\/`)}@(.+)$`)
            const match = entry.data.match(pattern)
            if (match) {
              globals.push({
                isActive: false,
                packageManager: 'yarn',
                packageName: pkg,
                path: getYarnGlobalPath(pkg),
                version: match[1],
              })
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

function markActiveInstallation(
  globals: GlobalInstallation[],
  activeBinaryPath: string | null,
): GlobalInstallation[] {
  if (!activeBinaryPath) {
    return globals
  }

  // Determine which package manager the active binary belongs to
  // by checking path patterns. Order matters - check more specific patterns first.
  let activePackageManager: PackageManager | null = null

  // pnpm patterns
  if (
    activeBinaryPath.includes('/pnpm/') ||
    activeBinaryPath.includes('\\.pnpm\\') ||
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
  // npm patterns - most common case, check last
  // npm typically installs to /usr/local/bin, /usr/bin, or %AppData%/npm on Windows
  else if (
    activeBinaryPath.includes('/lib/node_modules/') ||
    activeBinaryPath.includes('\\npm\\') ||
    activeBinaryPath.includes('/usr/local/bin/') ||
    activeBinaryPath.includes('/usr/bin/')
  ) {
    activePackageManager = 'npm'
  }

  return globals.map((g) => ({
    ...g,
    // Mark as active if it's from the detected package manager and is the sanity package
    // (since that's what `which sanity` finds)
    isActive: g.packageManager === activePackageManager && g.packageName === 'sanity',
  }))
}

function getNpmGlobalPath(pkg: string): string {
  // Best effort path - actual path depends on system
  return `/usr/local/lib/node_modules/${pkg}`
}

function getPnpmGlobalPath(pkg: string): string {
  return `~/.local/share/pnpm/global/node_modules/${pkg}`
}

function getYarnGlobalPath(pkg: string): string {
  return `~/.config/yarn/global/node_modules/${pkg}`
}
