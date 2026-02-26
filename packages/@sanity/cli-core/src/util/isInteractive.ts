export function isInteractive(): boolean {
  return process.stdin.isTTY && process.env.TERM !== 'dumb' && !('CI' in process.env)
}
