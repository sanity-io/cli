import 'cli-testing-library/vitest'

// Suppress DEP0190 from cli-testing-library's use of shell: true in spawn()
const originalEmit = process.emit.bind(process) as (
  event: string | symbol,
  ...args: unknown[]
) => boolean

process.emit = function (event: string | symbol, ...args: unknown[]) {
  if (event === 'warning' && (args[0] as {code?: string})?.code === 'DEP0190') {
    return false
  }
  return originalEmit(event, ...args)
} as typeof process.emit
