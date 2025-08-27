export function isInteractive(): boolean {
  return process.stdout.isTTY && process.env.TERM !== 'dumb' && !('CI' in process.env)
}