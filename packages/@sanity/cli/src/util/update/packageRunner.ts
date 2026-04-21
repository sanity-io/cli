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
