import {analyzeIssues} from './analyzeIssues.js'
import {detectGlobalInstallations} from './detectGlobals.js'
import {collectPackageInfo} from './detectPackages.js'
import {detectWorkspace} from './detectWorkspace.js'
import {type CliInstallationInfo, type ExecutionContext, type SanityPackage} from './types.js'

const SANITY_PACKAGES: SanityPackage[] = ['sanity', '@sanity/cli']

export interface DetectCliInstallationOptions {
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
  const userAgent = process.env.npm_config_user_agent ?? ''
  let packageManager: ExecutionContext['packageManager'] = null

  if (userAgent.includes('pnpm')) {
    packageManager = 'pnpm'
  } else if (userAgent.includes('yarn')) {
    packageManager = 'yarn'
  } else if (userAgent.includes('bun')) {
    packageManager = 'bun'
  } else if (/^npm\//.test(userAgent)) {
    packageManager = 'npm'
  }

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
    // Check if running from node_modules (local)
    else if (binaryPath.includes('node_modules')) {
      resolvedFrom = 'local'
    }
    // Check if there's an active global installation
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
