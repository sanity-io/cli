import {getRunningPackageManager} from '@sanity/cli-core/package-manager'

import {analyzeIssues} from './analyzeIssues.js'
import {detectGlobalInstallations} from './detectGlobals.js'
import {collectPackageInfo} from './detectPackages.js'
import {detectWorkspace} from './detectWorkspace.js'
import {type CliInstallationInfo, type ExecutionContext, type SanityPackage} from './types.js'

const SANITY_PACKAGES: SanityPackage[] = ['sanity', '@sanity/cli']

interface DetectCliInstallationOptions {
  cwd?: string
}

/**
 * Main entry point for detecting CLI installation status.
 * Gathers information about workspace configuration, package declarations,
 * installed versions, global installations, and potential issues.
 */
export async function detectCliInstallation(
  options?: DetectCliInstallationOptions,
): Promise<CliInstallationInfo> {
  const cwd = options?.cwd ?? process.cwd()

  // Run detection in parallel where possible
  const [workspace, globalInstallations] = await Promise.all([
    detectWorkspace(cwd),
    detectGlobalInstallations(),
  ])

  // Collect package info for both sanity packages
  const packageInfoResults = await Promise.all(
    SANITY_PACKAGES.map(async (name) => {
      const info = await collectPackageInfo(name, cwd, workspace)
      return [name, info] as const
    }),
  )

  const packages: Partial<Record<SanityPackage, CliInstallationInfo['packages'][SanityPackage]>> =
    Object.fromEntries(
      packageInfoResults.filter(([, info]) => info.declared || info.override || info.installed),
    )

  // Detect execution context
  const currentExecution = detectExecutionContext(globalInstallations)

  // Analyze for issues
  const issues = analyzeIssues(packages, workspace, globalInstallations)

  return {
    currentExecution,
    globalInstallations,
    issues,
    packages,
    workspace,
  }
}

function detectExecutionContext(
  globalInstallations: CliInstallationInfo['globalInstallations'],
): ExecutionContext {
  // Try to determine how we're running
  const binaryPath = process.argv[1] ?? null

  // Check npm_config_user_agent for package manager
  const packageManager: ExecutionContext['packageManager'] = getRunningPackageManager() ?? null

  // Determine if we're running from global, local, or npx
  let resolvedFrom: ExecutionContext['resolvedFrom'] = 'unknown'

  if (binaryPath) {
    // Check if running via npx
    if (
      process.env.npm_execpath?.includes('npx') ||
      binaryPath.includes('/_npx/') ||
      binaryPath.includes('\\_npx\\')
    ) {
      resolvedFrom = 'npx'
    }
    // Check if there's an active global installation whose path matches
    // the binary path. This must come before the node_modules check because
    // npm global installs also contain node_modules in their path
    // (e.g. ~/.nvm/.../lib/node_modules/sanity/bin/sanity.js).
    else if (
      globalInstallations.some(
        (g) => g.isActive && g.path !== null && binaryPath.startsWith(g.path),
      )
    ) {
      resolvedFrom = 'global'
    }
    // Check if running from node_modules (local)
    else if (binaryPath.includes('node_modules')) {
      resolvedFrom = 'local'
    }
    // Fallback: if there's an active global installation but we couldn't
    // match by path (e.g. path is null), still classify as global
    else if (globalInstallations.some((g) => g.isActive)) {
      resolvedFrom = 'global'
    }
  }

  return {
    binaryPath,
    packageManager,
    resolvedFrom,
  }
}
