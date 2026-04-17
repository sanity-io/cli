export type TemporaryPackageRunner = 'bunx' | 'npx' | 'pnpm-dlx' | 'yarn-dlx'

export function detectTemporaryPackageRunner(
  binaryPath: string = process.argv[1] ?? '',
): TemporaryPackageRunner | null {
  const normalized = binaryPath.replaceAll('\\', '/')

  if (normalized.includes('/_npx/')) return 'npx'
  if (normalized.includes('/pnpm/dlx/')) return 'pnpm-dlx'
  if (normalized.includes('/dlx-')) return 'yarn-dlx'
  if (normalized.includes('/bunx-')) return 'bunx'

  return null
}

export function isTemporaryPackageRunner(binaryPath: string = process.argv[1] ?? ''): boolean {
  return detectTemporaryPackageRunner(binaryPath) !== null
}
