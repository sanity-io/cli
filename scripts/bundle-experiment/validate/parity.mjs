/**
 * Parity harness: runs every command id through the BUNDLED and UNBUNDLED CLI
 * and compares exit code + normalized output.
 *
 * Modes:
 *   node parity.mjs help    — `<id> --help` for every command id (exhaustive)
 *   node parity.mjs exec    — bare execution to the natural boundary
 *                             (usage error / auth wall / real output),
 *                             outside a project and inside the fixture studio
 *
 * Browser-opening and long-running commands are excluded from exec mode
 * (validated separately); everything still gets help parity.
 */
import {execFileSync, spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const S = path.dirname(new URL(import.meta.url).pathname) // .../validate
const SCRATCH = path.dirname(S) // .../scripts/bundle-experiment
const REPO = path.resolve(SCRATCH, '../..') // repo root, derived like bundle.mjs
const BUNDLED_BIN = path.join(SCRATCH, 'smoke/node_modules/.bin/sanity')
// fair control: the UNBUNDLED CLI packed and npm-installed the same way
// (a git checkout behaves differently for install-detection, paths, etc.)
const UNBUNDLED_BIN = path.join(SCRATCH, 'control/node_modules/@sanity/cli/bin/run.js')
const FIXTURE = path.join(REPO, 'fixtures/basic-studio')
const MANIFEST = path.join(SCRATCH, 'stage/oclif.manifest.json')

const mode = process.argv[2]
if (!['help', 'exec'].includes(mode)) throw new Error('usage: parity.mjs help|exec')

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const ids = Object.keys(manifest.commands).sort()

// Version strings differ between the two artifacts and must be normalized out.
// The base version is on the manifest; the bundled stage carries a suffixed
// version in its package.json. Sort longest-first so the suffixed form is
// replaced before its base prefix can partially match it.
const stagePkg = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'stage/package.json'), 'utf8'))
const VERSIONS = [stagePkg.version, manifest.version]
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)

// commands that open a browser or run indefinitely — help parity only
const EXEC_EXCLUDED = new Set([
  'login', // opens browser for auth flow
  'learn',
  'manage',
  'docs:browse',
  'docs:read', // opens browser without args? conservative
  'dev', // long-running (validated separately: serves + curl 200)
  'preview', // long-running server
  'start', // alias of preview
])

const ANSI = /\[[0-9;]*m/g
function normalize(s, side) {
  // version differences between the two artifacts (longest-first)
  const versioned = VERSIONS.reduce((acc, v) => acc.replaceAll(v, '<VER>'), s.replace(ANSI, ''))
  return (
    versioned
      // one-time JIT lines only exist on the bundled side
      .replace(/^One-time setup: installing .*\n/gm, '')
      .replace(/^npm (warn|notice).*\n/gm, '')
      // absolute install locations differ
      .replaceAll(path.join(SCRATCH, 'smoke/node_modules'), '<NM>')
      .replaceAll(path.join(SCRATCH, 'control/node_modules'), '<NM>')
      .replaceAll(path.join(REPO, 'packages/@sanity/cli'), '<NM>/@sanity/cli')
      .replaceAll(REPO, '<REPO>')
      .replace(/\((\d+(\.\d+)?)(ms|s)\)/g, '(<T>)')
      // wrapped-line artifacts: collapse all whitespace runs
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function runOne(bin, args, cwd, home) {
  fs.mkdirSync(home, {recursive: true})
  const res = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    timeout: 120000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      NO_UPDATE_NOTIFIER: '1',
      NO_COLOR: '1',
      CI: '', // make isCi() consistent
    },
  })
  return {
    status: res.status,
    signal: res.signal,
    out: (res.stdout || '') + (res.stderr || ''),
    timedOut: res.error?.code === 'ETIMEDOUT',
  }
}

function resetFixture() {
  execFileSync('git', ['checkout', '--', '.'], {cwd: FIXTURE})
  execFileSync('git', ['clean', '-fdq', '.'], {cwd: FIXTURE})
}

const neutralDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-neutral-'))
// Isolated fake $HOME per artifact so each command's config/cache/telemetry
// writes never touch the real home. Kept at a FIXED tmpdir path (not mkdtemp)
// so the bundled side's one-time JIT toolchain install is reused across runs;
// under tmpdir so these (the bundled one grows to ~0.5GB) never clutter the
// working tree.
const homes = {
  bundled: path.join(os.tmpdir(), 'parity-home-bundled'),
  unbundled: path.join(os.tmpdir(), 'parity-home-unbundled'),
}

const results = []
const contexts =
  mode === 'help'
    ? [['neutral', neutralDir]]
    : [
        ['neutral', neutralDir],
        ['fixture', FIXTURE],
      ]

for (const id of ids) {
  if (mode === 'exec' && EXEC_EXCLUDED.has(id)) continue
  const args = mode === 'help' ? [...id.split(':'), '--help'] : id.split(':')
  for (const [ctxName, cwd] of contexts) {
    if (cwd === FIXTURE) resetFixture()
    const a = runOne(
      BUNDLED_BIN.replace('/.bin/sanity', '/@sanity/cli/bin/run.js'),
      args,
      cwd,
      homes.bundled,
    )
    if (cwd === FIXTURE) resetFixture()
    const b = runOne(UNBUNDLED_BIN, args, cwd, homes.unbundled)
    if (cwd === FIXTURE) resetFixture()
    const same =
      a.status === b.status &&
      a.timedOut === b.timedOut &&
      normalize(a.out, 'a') === normalize(b.out, 'b')
    results.push({
      id,
      ctx: ctxName,
      same,
      bundled: {status: a.status, timedOut: a.timedOut},
      unbundled: {status: b.status, timedOut: b.timedOut},
      ...(same
        ? {}
        : {
            bundledOut: normalize(a.out, 'a').slice(0, 600),
            unbundledOut: normalize(b.out, 'b').slice(0, 600),
          }),
    })
    process.stderr.write(`${same ? 'ok  ' : 'DIFF'} [${ctxName}] ${id}\n`)
  }
}

const diffs = results.filter((r) => !r.same)
fs.writeFileSync(
  path.join(S, `parity-${mode}-result.json`),
  JSON.stringify({mode, total: results.length, diffs: diffs.length, results: diffs}, null, 2),
)
console.log(JSON.stringify({mode, total: results.length, diffs: diffs.length}))
process.exit(diffs.length === 0 ? 0 : 1)
