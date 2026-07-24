/**
 * Async module-customization hooks (module.register) for Node versions
 * without module.registerHooks (>= 22.12 < 22.15). Runs on the hooks thread;
 * shares no state with the main thread. ESM-only — CJS require() is covered
 * by the Module._resolveFilename patch in toolchainHook.js.
 *
 * Unlike the sync API, nextResolve returns a promise, so fallbacks must
 * await/catch rather than try/catch synchronously.
 */
import {
  ensureToolchain,
  matchStub,
  matchToolchain,
  requireResolveFromDir,
  stubURL,
} from './toolchainCore.js'

const inFlight = new Set()

export async function resolve(specifier, context, nextResolve) {
  const stubbed = matchStub(specifier)
  if ((!stubbed && !matchToolchain(specifier)) || inFlight.has(specifier)) {
    return nextResolve(specifier, context)
  }
  inFlight.add(specifier)
  try {
    return await resolveInner(specifier, context, nextResolve, stubbed)
  } finally {
    inFlight.delete(specifier)
  }
}

async function resolveInner(specifier, context, nextResolve, stubbed) {
  try {
    return await nextResolve(specifier, context)
  } catch {
    // fall through to project / cache / stub
  }
  const fromProject = requireResolveFromDir(specifier, process.cwd())
  if (fromProject) return {url: fromProject, shortCircuit: true}
  if (stubbed) return {url: stubURL, shortCircuit: true}
  const cacheDir = ensureToolchain()
  const fromCache = requireResolveFromDir(specifier, cacheDir)
  if (fromCache) return {url: fromCache, shortCircuit: true}
  throw new Error(
    `Unable to resolve ${specifier} from the Sanity CLI toolchain cache (${cacheDir})`,
  )
}
