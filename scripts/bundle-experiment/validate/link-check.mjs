/**
 * Exhaustive module-linking check for the bundled CLI.
 *
 * Imports every .js file under the installed package's dist/. A file passes if
 * it links and evaluates, OR if it throws a *runtime* error that proves linking
 * succeeded (e.g. a worker guard). It fails on resolution/link/syntax errors.
 *
 * Workers (*.worker.js) are imported inside real worker threads, with the JIT
 * hook forwarded via execArgv exactly like production spawns.
 *
 * Usage: node --import <pkg>/dist/_jit/toolchainHook.js link-check.mjs <pkgRoot>
 */
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {Worker} from 'node:worker_threads'

const pkgRoot = process.argv[2]
if (!pkgRoot) throw new Error('usage: link-check.mjs <pkgRoot>')
const distDir = path.join(pkgRoot, 'dist')

const LINK_ERROR_MARKERS = [
  'ERR_MODULE_NOT_FOUND',
  'MODULE_NOT_FOUND',
  'Cannot find module',
  'Cannot find package',
  'does not provide an export named',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'Unexpected token',
  'ERR_UNKNOWN_FILE_EXTENSION',
]

function isLinkError(err) {
  const s = `${err?.code || ''} ${err?.message || ''}`
  return LINK_ERROR_MARKERS.some((m) => s.includes(m))
}

function collect(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...collect(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

const files = collect(distDir)
const workers = files.filter((f) => f.endsWith('.worker.js'))
const mains = files.filter(
  // bin/run.js boots oclif at import time (validated by every CLI invocation
  // in the other harnesses) — everything else must be import-safe
  (f) => !f.endsWith('.worker.js') && path.relative(distDir, f) !== path.join('bin', 'run.js'),
)

const failures = []
const runtimeThrows = []

for (const f of mains) {
  try {
    await import(pathToFileURL(f).href)
  } catch (err) {
    if (isLinkError(err)) {
      failures.push({file: path.relative(distDir, f), error: String(err).slice(0, 300)})
    } else {
      runtimeThrows.push({file: path.relative(distDir, f), error: String(err).slice(0, 120)})
    }
  }
}

// Workers: import inside a real worker thread. A runtime guard throw counts as
// a successful link; a resolution error does not.
const hookUrl = process.env.SANITY_CLI_JIT_HOOK
for (const f of workers) {
  const result = await new Promise((resolve) => {
    const code = `
      import {parentPort, workerData} from 'node:worker_threads'
      try {
        await import(workerData.target)
        parentPort.postMessage({ok: true})
      } catch (err) {
        parentPort.postMessage({ok: false, code: err?.code || '', message: String(err).slice(0, 300)})
      }
    `
    const w = new Worker(code, {
      eval: true,
      workerData: {target: pathToFileURL(f).href},
      execArgv: hookUrl ? [...process.execArgv, '--import', hookUrl] : process.execArgv,
      stdout: true,
      stderr: true,
    })
    let output = ''
    w.stdout.on('data', (d) => (output += d))
    w.stderr.on('data', (d) => (output += d))
    // Some workers legitimately stay alive after import (message loops,
    // registered environments). Resolution/link errors reject quickly — a
    // quiet, error-free 20s means the module fully linked and evaluated.
    const timer = setTimeout(() => {
      w.terminate()
      resolve({ok: true, note: `aliveAfterImport; output: ${output.slice(-120)}`})
    }, 20000)
    w.on('message', (m) => {
      clearTimeout(timer)
      w.terminate()
      resolve(m)
    })
    w.on('error', (err) => {
      clearTimeout(timer)
      resolve({ok: false, code: err?.code || '', message: String(err).slice(0, 300)})
    })
  })
  if (result.ok && result.note) {
    runtimeThrows.push({file: path.relative(distDir, f), error: result.note.slice(0, 120)})
  } else if (!result.ok) {
    const pseudoErr = {code: result.code, message: result.message}
    if (isLinkError(pseudoErr)) {
      failures.push({file: path.relative(distDir, f), error: `${result.code} ${result.message}`})
    } else {
      runtimeThrows.push({file: path.relative(distDir, f), error: result.message.slice(0, 120)})
    }
  }
}

console.log(
  JSON.stringify(
    {
      total: files.length,
      mains: mains.length,
      workers: workers.length,
      linkFailures: failures,
      runtimeThrows,
      pass: failures.length === 0,
    },
    null,
    2,
  ),
)
process.exit(failures.length === 0 ? 0 : 1)
