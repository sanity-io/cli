import {execFileSync} from 'node:child_process'

interface PackageManager {
  /** Returns the full command + args to run `create sanity@<version>` with extra args. */
  createCommand: (version: string, args: string[]) => string[]
  name: string
}

/** Returns the version string if the command is available, or `null` if not. */
function getVersion(command: string): string | null {
  try {
    return execFileSync(command, ['--version'], {encoding: 'utf8', stdio: 'pipe'}).trim()
  } catch {
    return null
  }
}

/** Returns package managers available on the current system. */
export function getAvailablePackageManagers(): PackageManager[] {
  const managers: PackageManager[] = []

  if (getVersion('npx')) {
    managers.push({
      createCommand: (version, args) => ['npx', '--yes', `create-sanity@${version}`, ...args],
      name: 'npm',
    })
  }

  if (getVersion('pnpm')) {
    managers.push({
      createCommand: (version, args) => ['pnpm', 'create', `sanity@${version}`, ...args],
      name: 'pnpm',
    })
  }

  const yarnVersion = getVersion('yarn')
  if (yarnVersion) {
    const major = Number.parseInt(yarnVersion.split('.')[0], 10)
    // yarn dlx is only available in Yarn Berry (v2+)
    if (major >= 2) {
      managers.push({
        createCommand: (version, args) => ['yarn', 'dlx', `create-sanity@${version}`, ...args],
        name: 'yarn',
      })
    }
  }

  return managers
}
