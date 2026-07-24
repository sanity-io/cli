/**
 * Shared core for the JIT toolchain resolution hook (see toolchainHook.js).
 * Must stay dependency-free: node builtins only. Also used from the async
 * hooks thread on Node versions without module.registerHooks (< 22.15).
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

export const TOOLCHAIN = /* @versions */ {}

// Packages resolved to an inert local stub instead of being installed.
// @module-federation/dts-plugin: statically reachable from the workbench
// build pipeline, but the workbench hard-disables dts type generation
// (dts: {generateTypes: false}), so none of its APIs ever execute.
export const STUB_PREFIXES = ['@module-federation/dts-plugin']
export const stubURL = new URL('dtsPluginStub.js', import.meta.url).href

const names = Object.keys(TOOLCHAIN)
let cacheNodeModules = null

export function matchToolchain(specifier) {
  return names.some((n) => specifier === n || specifier.startsWith(`${n}/`))
}

export function matchStub(specifier) {
  return STUB_PREFIXES.some((n) => specifier === n || specifier.startsWith(`${n}/`))
}

export function ensureToolchain() {
  if (cacheNodeModules) return cacheNodeModules
  const key = Object.entries(TOOLCHAIN)
    .map(([n, v]) => `${n.replace(/\//g, '__')}@${v.replace(/[\^~]/g, '')}`)
    .join('+')
  const dir = path.join(os.homedir(), '.sanity', 'cli-jit', key)
  const marker = path.join(dir, '.install-ok')
  if (!fs.existsSync(marker)) {
    process.stderr.write('One-time setup: installing Sanity dev toolchain (vite, tsx)…\n')
    fs.mkdirSync(dir, {recursive: true})
    const specs = Object.entries(TOOLCHAIN).map(([n, v]) => `${n}@${v}`)
    const res = spawnSync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--prefix', dir, ...specs],
      {stdio: ['ignore', 'ignore', 'inherit']},
    )
    if (res.status !== 0) {
      throw new Error(
        `Failed to install the Sanity dev toolchain (${specs.join(', ')}). ` +
          `Install it in your project instead: npm install -D ${specs.join(' ')}`,
      )
    }
    fs.writeFileSync(marker, '')
  }
  cacheNodeModules = path.join(dir, 'node_modules')
  return cacheNodeModules
}

/** CJS-resolver resolution of `specifier` as if required from inside `dir`. */
export function requireResolveFromDir(specifier, dir) {
  const anchor = path.join(dir, '__jit_resolver__.js')
  try {
    const req = createRequire(anchor)
    return pathToFileURL(req.resolve(specifier)).href
  } catch {
    return null
  }
}

/**
 * Re-entrancy guard: requireResolveFromDir's createRequire().resolve() is
 * itself intercepted by the registered hooks, re-entering this resolver for
 * the same specifier. Unguarded, a failing re-entrant resolution recurses
 * until stack overflow — the RangeError is swallowed by the fallback
 * try/catches and the cycle restarts, hanging the thread (observed in worker
 * threads). While a specifier is in flight, re-entrant calls go straight to
 * the default resolver.
 */
const inFlight = new Set()

export function isInFlight(specifier) {
  return inFlight.has(specifier)
}

/**
 * Hook-style resolution: default resolver first, then the current project,
 * then the stub (for stubbed packages) or the installed-on-demand cache.
 * `next(specifier, contextOverrides)` must run the default resolver chain.
 * Works for both the sync and async hook APIs.
 */
export function resolveWithFallbacks(specifier, context, next) {
  inFlight.add(specifier)
  try {
    return resolveWithFallbacksInner(specifier, context, next)
  } finally {
    inFlight.delete(specifier)
  }
}

function resolveWithFallbacksInner(specifier, context, next) {
  const stubbed = matchStub(specifier)
  try {
    return next(specifier, context)
  } catch {
    if (process.env.SANITY_JIT_DEBUG) {
      process.stderr.write(`[jit-hook] miss: ${specifier} from ${context.parentURL}\n`)
    }
  }
  const fromProject = resolveFromDirWithNext(specifier, context, next, process.cwd())
  if (fromProject) return fromProject
  if (stubbed) {
    return {url: stubURL, shortCircuit: true}
  }
  const cacheDir = ensureToolchain()
  const fromCache = resolveFromDirWithNext(specifier, context, next, cacheDir)
  if (fromCache) return fromCache
  throw new Error(
    `Unable to resolve ${specifier} from the Sanity CLI toolchain cache (${cacheDir})`,
  )
}

/**
 * Resolve `specifier` as if imported from a file inside `dir`, using ONLY the
 * CJS resolver (createRequire):
 * - require() calls ignore parentURL overrides passed to next() (their parent
 *   paths are fixed), so next()-delegation can't serve bundled CJS anyway.
 * - re-entering the default resolver via next() with an overridden parentURL
 *   from inside a sync resolve hook deadlocks a worker thread's initial
 *   module-graph load (observed on node 26); createRequire has no such hazard.
 * Every package this hook serves resolves under require conditions (verified
 * in validation); an import-only package would need a different strategy.
 */
function resolveFromDirWithNext(specifier, context, next, dir) {
  const url = requireResolveFromDir(specifier, dir)
  return url ? {url, shortCircuit: true} : null
}
