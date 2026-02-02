/**
 * Detect which package manager is being used
 */
export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  const agent = process.env.npm_config_user_agent || ''
  if (agent.includes('pnpm')) return 'pnpm'
  if (agent.includes('yarn')) return 'yarn'
  return 'npm'
}
