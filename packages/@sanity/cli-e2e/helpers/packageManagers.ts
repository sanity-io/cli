import {execSync} from 'node:child_process'

export interface PackageManager {
  /** Returns the full command + args to run `create sanity@<version>` with extra args. */
  createCommand: (version: string, args: string[]) => string[]
  name: string
}

function isAvailable(command: string): boolean {
  try {
    execSync(`${command} --version`, {encoding: 'utf8', stdio: 'pipe'})
    return true
  } catch {
    return false
  }
}

/** Returns package managers available on the current system. */
export function getAvailablePackageManagers(): PackageManager[] {
  const managers: PackageManager[] = []

  if (isAvailable('npx')) {
    managers.push({
      createCommand: (version, args) => ['npx', '--yes', `create-sanity@${version}`, ...args],
      name: 'npm',
    })
  }

  if (isAvailable('pnpm')) {
    managers.push({
      createCommand: (version, args) => ['pnpm', 'create', `sanity@${version}`, ...args],
      name: 'pnpm',
    })
  }

  if (isAvailable('yarn')) {
    const yarnVersion = execSync('yarn --version', {encoding: 'utf8', stdio: 'pipe'}).trim()
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
