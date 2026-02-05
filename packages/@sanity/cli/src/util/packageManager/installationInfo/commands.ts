import {type CliInstallationInfo, type PackageManager, type SanityPackage} from './types.js'

interface TargetVersions {
  '@sanity/cli'?: string
  sanity?: string
}

/**
 * Generates upgrade commands based on the detected installation.
 * Returns commands for the appropriate package manager.
 */
export function getUpgradeCommands(
  info: CliInstallationInfo,
  targetVersions?: TargetVersions,
): string[] {
  const commands: string[] = []
  const pm = info.workspace.lockfile?.type || 'npm'

  // Determine which packages need upgrading
  const packagesToUpgrade: Array<{name: SanityPackage; version?: string}> = []

  // Check local installations
  for (const [name, pkgInfo] of Object.entries(info.packages) as [
    SanityPackage,
    NonNullable<(typeof info.packages)[SanityPackage]>,
  ][]) {
    if (pkgInfo?.declared) {
      const targetVersion = targetVersions?.[name]
      packagesToUpgrade.push({name, version: targetVersion})
    }
  }

  if (packagesToUpgrade.length > 0) {
    commands.push(...generateUpgradeCommand(pm, packagesToUpgrade))
  }

  // Check global installations
  for (const global of info.globalInstallations) {
    const targetVersion = targetVersions?.[global.packageName]
    commands.push(
      ...generateGlobalUpgradeCommand(global.packageManager, global.packageName, targetVersion),
    )
  }

  return commands
}

/**
 * Generates commands to fix detected issues.
 */
export function getFixCommands(info: CliInstallationInfo): string[] {
  const commands: string[] = []
  const pm = info.workspace.lockfile?.type || 'npm'

  for (const issue of info.issues) {
    switch (issue.type) {
      case 'cli-version-incompatible': {
        // Reinstall to get correct version
        commands.push(getInstallCommand(pm))
        break
      }

      case 'conflicting-cli-dependency': {
        // Remove the conflicting dependency
        if (issue.packageName) {
          commands.push(getLocalRemoveCommand(pm, issue.packageName), getInstallCommand(pm))
        }
        break
      }

      case 'declared-not-installed': {
        commands.push(getInstallCommand(pm))
        break
      }

      case 'global-cli-incompatible': {
        // Suggest removing the incompatible global installation
        if (issue.packageName) {
          const globalMatch = info.globalInstallations.find(
            (g) => g.packageName === issue.packageName,
          )
          if (globalMatch) {
            commands.push(getGlobalUninstallCommand(globalMatch.packageManager, issue.packageName))
          }
        }
        break
      }

      case 'multiple-lockfiles': {
        // Can't auto-fix, but provide guidance
        break
      }
    }
  }

  // Remove duplicates
  return [...new Set(commands)]
}

function generateUpgradeCommand(
  pm: PackageManager,
  packages: Array<{name: string; version?: string}>,
): string[] {
  const pkgSpecs = packages.map((p) => (p.version ? `${p.name}@${p.version}` : p.name))

  switch (pm) {
    case 'bun': {
      return [`bun update ${pkgSpecs.join(' ')}`]
    }
    case 'npm': {
      return [`npm update ${pkgSpecs.join(' ')}`]
    }
    case 'pnpm': {
      return [`pnpm update ${pkgSpecs.join(' ')}`]
    }
    case 'yarn': {
      return [`yarn upgrade ${pkgSpecs.join(' ')}`]
    }
    default: {
      return [`# Update packages: ${pkgSpecs.join(' ')}`]
    }
  }
}

function generateGlobalUpgradeCommand(
  pm: PackageManager,
  packageName: string,
  version?: string,
): string[] {
  const pkgSpec = version ? `${packageName}@${version}` : packageName

  switch (pm) {
    case 'bun': {
      return [`bun update -g ${pkgSpec}`]
    }
    case 'npm': {
      return [`npm update -g ${pkgSpec}`]
    }
    case 'pnpm': {
      return [`pnpm update -g ${pkgSpec}`]
    }
    case 'yarn': {
      return [`yarn global upgrade ${pkgSpec}`]
    }
    default: {
      return [`# Update global package: ${pkgSpec}`]
    }
  }
}

function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'bun': {
      return 'bun install'
    }
    case 'npm': {
      return 'npm install'
    }
    case 'pnpm': {
      return 'pnpm install'
    }
    case 'yarn': {
      return 'yarn install'
    }
    default: {
      return '# Run your package manager install command'
    }
  }
}

export function getGlobalUninstallCommand(pm: PackageManager, packageName: string): string {
  switch (pm) {
    case 'bun': {
      return `bun remove -g ${packageName}`
    }
    case 'npm': {
      return `npm uninstall -g ${packageName}`
    }
    case 'pnpm': {
      return `pnpm remove -g ${packageName}`
    }
    case 'yarn': {
      return `yarn global remove ${packageName}`
    }
    default: {
      return `# Uninstall global package: ${packageName}`
    }
  }
}

export function getLocalRemoveCommand(pm: PackageManager, packageName: string): string {
  switch (pm) {
    case 'bun': {
      return `bun remove ${packageName}`
    }
    case 'npm': {
      return `npm uninstall ${packageName}`
    }
    case 'pnpm': {
      return `pnpm remove ${packageName}`
    }
    case 'yarn': {
      return `yarn remove ${packageName}`
    }
    default: {
      return `# Remove package: ${packageName}`
    }
  }
}
