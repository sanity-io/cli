import {getCliExecutionContext} from '../executionContext.js'

export function isInteractive(): boolean {
  // Programmatic invocations (execution context active) are never interactive,
  // even if the host process happens to have a TTY.
  if (getCliExecutionContext()) return false

  return Boolean(process.stdin.isTTY) && process.env.TERM !== 'dumb' && !('CI' in process.env)
}
