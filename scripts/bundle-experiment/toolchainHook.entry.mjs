/**
 * JIT toolchain resolution hook for the bundled Sanity CLI.
 *
 * The dev toolchain (vite, vite-node, tsx, jsdom, @sanity/codegen) is not
 * shipped with the base install — commands that never touch it (login, init,
 * datasets, docs, …) shouldn't pay ~40MB of build tooling on a cold `npx`
 * run. When a dev-shaped command imports one of these packages, resolution
 * falls back to the current project's node_modules, then to a per-user cache
 * (~/.sanity/cli-jit) installed once on demand.
 *
 * Registered at CLI boot (main thread) and re-registered in worker threads
 * via `--import` (see SANITY_CLI_JIT_HOOK / jitToolchainExecArgv).
 *
 * Node >= 22.15 / 23.5 has module.registerHooks (sync; covers ESM import AND
 * CJS require). Older supported versions (>= 22.12) fall back to the async
 * module.register API for ESM plus a Module._resolveFilename patch for CJS.
 */
// NOTE: named imports would be link-time errors on Node versions where an
// export doesn't exist (registerHooks < 22.15) — feature-detect off the
// namespace instead.
import Module from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  ensureToolchain,
  isInFlight,
  matchStub,
  matchToolchain,
  requireResolveFromDir,
  resolveWithFallbacks,
  stubURL,
} from './toolchainCore.js'

if (typeof Module.registerHooks === 'function') {
  Module.registerHooks({
    resolve(specifier, context, next) {
      if (!matchStub(specifier) && !matchToolchain(specifier)) return next(specifier, context)
      if (isInFlight(specifier)) return next(specifier, context)
      return resolveWithFallbacks(specifier, context, next)
    },
  })
} else {
  // ESM interception (runs on the async hooks thread)
  Module.register('./toolchainHookAsync.js', import.meta.url)

  // CJS interception: all require() calls funnel through Module._resolveFilename.
  // The same re-entrancy hazard applies (requireResolveFromDir funnels back
  // through this very function) — guard with a per-request in-flight set.
  const cjsInFlight = new Set()
  const orig = Module._resolveFilename
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (
      (!matchStub(request) && !matchToolchain(request)) ||
      cjsInFlight.has(request) ||
      isInFlight(request)
    ) {
      return orig.call(this, request, parent, isMain, options)
    }
    cjsInFlight.add(request)
    try {
      try {
        return orig.call(this, request, parent, isMain, options)
      } catch {
        // fall back below
      }
      const fromProject = requireResolveFromDir(request, process.cwd())
      if (fromProject) return fileURLToPath(fromProject)
      if (matchStub(request)) return fileURLToPath(stubURL)
      const cacheDir = ensureToolchain()
      const fromCache = requireResolveFromDir(request, cacheDir)
      if (fromCache) return fileURLToPath(fromCache)
      throw new Error(`Unable to resolve ${request} from the Sanity CLI toolchain cache`)
    } finally {
      cjsInFlight.delete(request)
    }
  }
}
