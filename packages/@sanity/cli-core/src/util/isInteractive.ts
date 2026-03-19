export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && process.env.TERM !== 'dumb' && !('CI' in process.env)
}
