/**
 * Get the appropriate update command for the package manager
 */
export default function getUpdateCommand(pm: 'npm' | 'pnpm' | 'yarn'): string {
  const commands = {
    npm: 'npm install -g @sanity/cli',
    pnpm: 'pnpm add -g @sanity/cli',
    yarn: 'yarn global add @sanity/cli',
  }
  return commands[pm]
}
