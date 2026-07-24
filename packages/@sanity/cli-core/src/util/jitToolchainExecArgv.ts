/**
 * When the CLI runs from a bundled distribution, heavy toolchain packages
 * (vite, vite-node, tsx) are not installed with the CLI. The bundled bin
 * registers a module-resolution hook (see the distribution's `_jit` directory)
 * that resolves them from the current project or a per-user cache, and exposes
 * the hook's file URL via this environment variable.
 *
 * Module customization hooks do not propagate to worker threads, so every
 * worker spawn must re-register the hook via `--import`.
 */
const JIT_HOOK_ENV = 'SANITY_CLI_JIT_HOOK'

/**
 * execArgv for spawned workers: inherits the parent's execArgv, re-registering
 * the JIT toolchain resolution hook when one is active. Returns undefined when
 * no hook is active so Worker falls back to its default inheritance.
 *
 * @internal
 */
export function jitToolchainExecArgv(): string[] | undefined {
  const hookUrl = process.env[JIT_HOOK_ENV]
  if (!hookUrl) {
    return undefined
  }
  return [...process.execArgv, '--import', hookUrl]
}
