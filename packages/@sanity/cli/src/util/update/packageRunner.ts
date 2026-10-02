export type PackageRunner = 'bunx' | 'npx' | 'pnpm-dlx' | 'yarn-dlx'

export function detectPackageRunner(
  binaryPath: string = process.argv[1] ?? '',
): PackageRunner | null {
  const normalized = binaryPath.replaceAll('\\', '/')

  if (normalized.includes('/_npx/')) return 'npx'
  if (normalized.includes('/pnpm/dlx/')) return 'pnpm-dlx'
  if (normalized.includes('/xfs-') && normalized.includes('/dlx-')) return 'yarn-dlx'
  if (/\/bunx-\d+-/.test(normalized)) return 'bunx'

  return null
}

/**
 * The command that runs a package's bin through `runner` without installing
 * it, as `[command, ...args]`. `pkg` may carry a version (`@sanity/cli@1.2.3`).
 * yarn only needs `-p` when the bin name differs from the package name.
 */
export function getRunnerCommand(
  runner: PackageRunner,
  options: {bin: string; pkg: string},
  args: string[] = [],
): string[] {
  const {bin, pkg} = options
  switch (runner) {
    case 'bunx': {
      return ['bunx', pkg, ...args]
    }
    case 'npx': {
      return ['npx', '--yes', pkg, ...args]
    }
    case 'pnpm-dlx': {
      return ['pnpm', 'dlx', pkg, ...args]
    }
    case 'yarn-dlx': {
      const name = pkg.replace(/(.)@.*$/, '$1')
      return bin === name ? ['yarn', 'dlx', pkg, ...args] : ['yarn', 'dlx', '-p', pkg, bin, ...args]
    }
    default: {
      const _exhaustive: never = runner
      throw new Error(`Unknown runner: ${_exhaustive as string}`)
    }
  }
}
