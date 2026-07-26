/**
 * Experimental publish-time bundler for @sanity/cli.
 *
 * Strategy: every module of @sanity/cli keeps its exact dist path (multi-entry),
 * so the oclif manifest, per-command lazy loading, import.meta.url asset math and
 * worker spawns all keep working. Workspace packages (cli-core, cli-build,
 * workbench-cli) are "vendored": all their dist files become entries under
 * _vendor/<pkg>/ so their own relative worker/asset refs hold too. Third-party
 * pure-JS deps get inlined into shared chunks (tree-shaken). Only the genuinely
 * runtime-external toolchain stays in package.json dependencies.
 *
 * Iteration 2: the two heavy oclif plugins (@sanity/runtime-cli, @sanity/codegen)
 * are no longer dependencies. Their commands become JIT stubs: help comes from
 * merged manifest entries; on first run the real package is resolved from the
 * project or npm-installed once into ~/.sanity/cli-jit.
 */
import {execSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import {rolldown} from 'rolldown'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const CLI = path.join(ROOT, 'packages/@sanity/cli')
const STAGE = path.join(ROOT, '.bundle-stage')
const BUNDLER_DIR = path.dirname(new URL(import.meta.url).pathname)

// unbundleable small deps: left as bare imports AND kept as real dependencies
// (jiti requires its companion dist/babel.cjs relative to its own package root,
// open ships platform helper binaries, skills' bin is spawned as a subprocess).
// The dev toolchain (vite/vite-node/tsx/jsdom) also ships as real dependencies,
// so worker threads resolve it by ordinary Node resolution — no module hook, no
// execArgv plumbing. jsdom in particular loads its xhr-sync-worker.js via
// __dirname at module load, so it is unbundleable regardless.
const KEEP_DEPS = [
  '@oclif/plugin-help',
  '@oclif/plugin-not-found',
  'open',
  'jiti',
  'skills',
  'vite',
  'vite-node',
  'tsx',
  'jsdom',
]
// Kept external (not bundled, not a base dependency): @sanity/codegen drags the
// full babel+typescript tree (~73MB), so the typegen Vite plugin loads it on
// demand via cli-core's loadOnDemand (project → shared cache). Its exact version
// is pinned into package.json (`jitVersions`) below.
const JIT_TOOLCHAIN = ['@sanity/codegen']
// oclif plugins converted to JIT stubs: bare imports allowed, NOT dependencies
const JIT_PLUGINS = ['@sanity/runtime-cli', '@sanity/codegen']
// optional natives referenced behind try/catch inside deps — never installed
const PHANTOM_EXTERNALS = ['canvas', 'bufferutil', 'utf-8-validate', 'fsevents', 'lightningcss']
// Kept external and shipped as an inert bundled-dependency stub (see below): the
// dts plugin is imported via a runtime-computed import() that build-time
// substitution can't rewrite, and the workbench disables dts entirely, so the
// real plugin (typescript@7 native, ~30MB) would be dead weight. A tiny stub
// package resolves the import by ordinary Node resolution — no runtime hook.
const STUB_EXTERNALS = ['@module-federation/dts-plugin']

const VENDORS = {
  'cli-core': path.join(ROOT, 'packages/@sanity/cli-core'),
  'cli-build': path.join(ROOT, 'packages/@sanity/cli-build'),
  'workbench-cli': path.join(ROOT, 'packages/@sanity/workbench-cli'),
}

function collect(dir, base = dir) {
  const out = []
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      out.push(...collect(p, base))
    } else if (e.name.endsWith('.js')) {
      out.push(path.relative(base, p))
    }
  }
  return out
}

const input = {}
for (const rel of collect(path.join(CLI, 'dist'))) {
  input[rel.replace(/\.js$/, '')] = path.join(CLI, 'dist', rel)
}
for (const [name, dir] of Object.entries(VENDORS)) {
  for (const rel of collect(path.join(dir, 'dist'))) {
    input[`_vendor/${name}/${rel.replace(/\.js$/, '')}`] = path.join(dir, 'dist', rel)
  }
}
input['bin/run'] = path.join(CLI, 'bin/run.js')

// JIT helper is bundled too (needs @oclif/core) — stage it inside the CLI pkg
// so module resolution works during bundling
const jitHelperTmp = path.join(CLI, '.jit-helper-tmp.mjs')
fs.copyFileSync(path.join(BUNDLER_DIR, 'jitHelper.src.mjs'), jitHelperTmp)
input['_jit/jitHelper'] = jitHelperTmp

console.log(`variant: de-magicked (toolchain real, codegen on-demand)`)
console.log(`entries: ${Object.keys(input).length}`)

const externalMatchers = [
  ...KEEP_DEPS,
  ...JIT_TOOLCHAIN,
  ...JIT_PLUGINS,
  ...PHANTOM_EXTERNALS,
  ...STUB_EXTERNALS,
]
const isExternal = (id) => {
  if (id.startsWith('node:')) return true
  return externalMatchers.some((m) => id === m || id.startsWith(`${m}/`))
}

fs.rmSync(STAGE, {recursive: true, force: true})
fs.mkdirSync(path.join(STAGE, 'dist'), {recursive: true})

try {
  // jsonc-parser has no exports map; its `main` is a UMD build whose internal
  // relative require()s break when inlined into chunks — use its ESM build
  const cliRequire = createRequire(path.join(CLI, '__resolve__.js'))
  const jsoncEsm = path.join(
    path.dirname(cliRequire.resolve('jsonc-parser/package.json')),
    'lib/esm/main.js',
  )

  const bundle = await rolldown({
    input,
    platform: 'node',
    resolve: {alias: {'jsonc-parser': jsoncEsm}},
    external: (id) => isExternal(id),
    logLevel: 'warn',
    onwarn(warning, warn) {
      const code = warning.code || ''
      if (['CIRCULAR_DEPENDENCY', 'THIS_IS_UNDEFINED', 'EVAL', 'MIXED_EXPORT'].includes(code))
        return
      warn(warning)
    },
  })

  await bundle.write({
    dir: path.join(STAGE, 'dist'),
    format: 'esm',
    entryFileNames: '[name].js',
    chunkFileNames: '_chunks/[name]-[hash].js',
    minify: true,
    sourcemap: false,
  })
  await bundle.close()
} finally {
  fs.rmSync(jitHelperTmp, {force: true})
}

// ---- worker stubs in _chunks/ ----
// Modules that spawn workers via `new URL('x.worker.js', import.meta.url)` can
// get hoisted into shared chunks, where the relative URL then points at
// _chunks/x.worker.js. Emit a re-export stub there for every worker entry so
// both locations resolve. Collisions on basename are a hard error.
{
  const workerEntries = Object.keys(input).filter((n) => n.endsWith('.worker'))
  const seen = new Map()
  for (const name of workerEntries) {
    const base = `${path.basename(name)}.js`
    if (seen.has(base)) throw new Error(`worker basename collision: ${base}`)
    seen.set(base, name)
    fs.mkdirSync(path.join(STAGE, 'dist/_chunks'), {recursive: true})
    fs.writeFileSync(path.join(STAGE, 'dist/_chunks', base), `import '../${name}.js'\n`)
  }
  console.log(`worker stubs: ${workerEntries.length}`)
}

// ---- alias stubs for URL-referenced non-worker modules ----
// Some modules are loaded via runtime-computed `new URL('x.js', import.meta.url)`
// (e.g. manifest/iconResolver.js, deferred to keep jsdom off the hot path).
// rolldown can't rewrite those, and the referencing module may be hoisted into
// _chunks/, so the URL then points at the wrong place. Scan the ORIGINAL dist
// sources for such references and emit re-export stubs at every location the
// URL could resolve to from a chunk.
{
  const urlRefRe = /new URL\(\s*['"]([^'"]+\.js)['"]\s*,\s*import\.meta\.url\s*\)/g
  const stubbed = new Set()
  for (const [entryName, absPath] of Object.entries(input)) {
    if (!absPath.endsWith('.js') || !fs.existsSync(absPath)) continue
    const src = fs.readFileSync(absPath, 'utf8')
    for (const m of src.matchAll(urlRefRe)) {
      const ref = m[1]
      if (ref.endsWith('.worker.js')) continue // handled by worker stubs above
      // target entry as originally resolved (next to the source module)
      const targetEntry = path
        .join(path.dirname(entryName), ref)
        .replace(/\\/g, '/')
        .replace(/\.js$/, '')
      if (!input[targetEntry]) {
        console.log(`  url-ref: unresolved ${ref} from ${entryName} — skipping`)
        continue
      }
      // where the URL points if the referencing module was hoisted into _chunks/
      const fromChunks = path.normalize(path.join('_chunks', ref)).replace(/\\/g, '/')
      if (fromChunks.startsWith('..')) continue
      if (input[fromChunks.replace(/\.js$/, '')] || stubbed.has(fromChunks)) continue
      const stubAbs = path.join(STAGE, 'dist', fromChunks)
      if (fs.existsSync(stubAbs)) continue
      stubbed.add(fromChunks)
      fs.mkdirSync(path.dirname(stubAbs), {recursive: true})
      const rel = path
        .relative(path.dirname(path.join('dist', fromChunks)), path.join('dist', targetEntry))
        .replace(/\\/g, '/')
      fs.writeFileSync(stubAbs, `export * from '${rel}.js'\n`)
      console.log(`  url-ref stub: ${fromChunks} -> ${targetEntry}`)
    }
  }
}

// audit: import.meta.url inside shared chunks can break relative file access
{
  const chunkDir = path.join(STAGE, 'dist/_chunks')
  const offenders = fs
    .readdirSync(chunkDir)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.worker.js'))
    .filter((f) => fs.readFileSync(path.join(chunkDir, f), 'utf8').includes('import.meta.url'))
  console.log(`chunks containing import.meta.url: ${offenders.length}`)
  for (const f of offenders) console.log(`  audit: _chunks/${f}`)
}

// ---- assemble stage package ----
for (const f of ['templates', 'codemods']) {
  const src = path.join(CLI, f)
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(STAGE, f), {recursive: true})
  }
}
// cli-build ships static assets (favicons) resolved by walking up to the
// package root — in the bundle, that root is the stage package itself
fs.cpSync(path.join(VENDORS['cli-build'], 'static'), path.join(STAGE, 'static'), {
  recursive: true,
})

const pkg = JSON.parse(fs.readFileSync(path.join(CLI, 'package.json'), 'utf8'))
// exact installed version — JIT-installed packages MUST be pinned: their help
// text ships in the merged manifest at publish time, and a floating range
// would let the runtime-installed version drift from the documented one
// (observed: workspace runtime-cli 17.1.0 vs registry 17.2.0 flag diff)
const resolveExactVersion = (dep) => {
  for (const base of [CLI, ...Object.values(VENDORS)]) {
    const p = path.join(base, 'node_modules', dep, 'package.json')
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).version
  }
  throw new Error(`cannot resolve installed version for: ${dep}`)
}
const resolveVersion = (dep) => {
  const spec = pkg.dependencies[dep]
  if (spec && spec !== 'catalog:' && !spec.startsWith('workspace:')) return spec
  return `^${resolveExactVersion(dep)}`
}

// ---- JIT stubs: one stub command file per plugin command, help via manifest merge ----
const ourManifest = JSON.parse(fs.readFileSync(path.join(CLI, 'oclif.manifest.json'), 'utf8'))
const jitTopics = {
  typegen: {description: 'Generate TypeScript types from Sanity schema and GROQ queries'},
}
for (const plugin of JIT_PLUGINS) {
  const pluginRoot = path.join(CLI, 'node_modules', plugin)
  const pluginPkg = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'))
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'oclif.manifest.json'), 'utf8'))
  const versionSpec = resolveExactVersion(plugin)
  Object.assign(jitTopics, pluginPkg.oclif?.topics || {})

  for (const [id, entry] of Object.entries(manifest.commands)) {
    const parts = id.split(':')
    const stubRel = path.join('commands', ...parts) + '.js'
    const stubAbs = path.join(STAGE, 'dist', stubRel)
    if (fs.existsSync(stubAbs)) throw new Error(`stub collision: ${id} already exists`)
    fs.mkdirSync(path.dirname(stubAbs), {recursive: true})
    // stub sits at dist/commands/<parts...>.js; its dir is parts.length deep
    // relative to dist/, where _jit/ lives
    const depth = parts.length
    const helperRef = `${'../'.repeat(depth)}_jit/jitHelper.js`
    fs.writeFileSync(
      stubAbs,
      [
        `import {makeJitCommand} from '${helperRef}'`,
        `export default makeJitCommand(${JSON.stringify(plugin)}, ${JSON.stringify(versionSpec)}, ${JSON.stringify(entry.relativePath)})`,
        '',
      ].join('\n'),
    )
    ourManifest.commands[id] = {
      ...entry,
      pluginName: pkg.name,
      pluginAlias: pkg.name,
      pluginType: 'core',
      relativePath: ['dist', ...stubRel.split(path.sep)],
    }
  }
}
fs.writeFileSync(path.join(STAGE, 'oclif.manifest.json'), JSON.stringify(ourManifest))

// oclif config: drop the JIT'd plugins, merge their topics
const {default: oclifConfig} = await import(path.join(CLI, 'oclif.config.js'))
oclifConfig.plugins = (oclifConfig.plugins || []).filter((p) => !JIT_PLUGINS.includes(p))
oclifConfig.topics = {...jitTopics, ...oclifConfig.topics}
fs.writeFileSync(
  path.join(STAGE, 'oclif.config.js'),
  `export default ${JSON.stringify(oclifConfig, null, 2)}\n`,
)

// Exact versions this build was made with — pinned into package.json (below) so
// loadOnDemand and the JIT stub commands install a reproducible version, never a
// floating range (a range once let runtime-cli install 17.2.0 while the shipped
// help documented 17.1.0 flags).
const toolchainVersions = Object.fromEntries(JIT_TOOLCHAIN.map((d) => [d, resolveExactVersion(d)]))

// bin shim: boot the bundled entry. No resolution hook — the dev toolchain ships
// as real deps and @sanity/codegen is loaded on demand explicitly.
fs.mkdirSync(path.join(STAGE, 'bin'), {recursive: true})
fs.writeFileSync(
  path.join(STAGE, 'bin/run.js'),
  ['#!/usr/bin/env node', `await import('../dist/bin/run.js')`, ''].join('\n'),
)

// shebang on the bundled entry too, in case something execs it directly
const runPath = path.join(STAGE, 'dist/bin/run.js')
const runSrc = fs.readFileSync(runPath, 'utf8')
if (!runSrc.startsWith('#!')) fs.writeFileSync(runPath, `#!/usr/bin/env node\n${runSrc}`)

pkg.dependencies = Object.fromEntries(KEEP_DEPS.map((d) => [d, resolveVersion(d)]))
// exact pins for on-demand packages (read by loadOnDemand at runtime)
pkg.jitVersions = toolchainVersions
delete pkg.devDependencies
delete pkg.scripts
delete pkg.types
pkg.files = [
  './bin',
  './dist',
  './codemods',
  './static',
  './templates',
  './oclif.config.js',
  './oclif.manifest.json',
]

// Ship an inert @module-federation/dts-plugin as a bundled dependency so the
// runtime-computed import() resolves by ordinary Node resolution (no hook). The
// workbench disables dts, so its APIs never execute. A `./*` export keeps any
// dead-code subpath reference from throwing MODULE_NOT_FOUND.
const dtsStubDir = path.join(STAGE, 'node_modules/@module-federation/dts-plugin')
fs.mkdirSync(dtsStubDir, {recursive: true})
fs.copyFileSync(path.join(BUNDLER_DIR, 'dtsPluginStub.mjs'), path.join(dtsStubDir, 'index.mjs'))
fs.writeFileSync(
  path.join(dtsStubDir, 'package.json'),
  `${JSON.stringify(
    {
      name: '@module-federation/dts-plugin',
      version: '0.0.0-inert-stub',
      type: 'module',
      main: 'index.mjs',
      exports: {'.': './index.mjs', './package.json': './package.json', './*': './index.mjs'},
    },
    null,
    2,
  )}\n`,
)
// npm only bundles a dependency it also finds in `dependencies`; pin it to the
// stub's own version so the bundled copy satisfies the range and npm never
// fetches the real package from the registry.
pkg.dependencies['@module-federation/dts-plugin'] = '0.0.0-inert-stub'
pkg.bundledDependencies = ['@module-federation/dts-plugin']

pkg.version = `${pkg.version.split('-')[0]}-bundle-experiment.0`
fs.writeFileSync(path.join(STAGE, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

execSync('npm pack --quiet', {cwd: STAGE, stdio: 'inherit'})
const tarball = fs.readdirSync(STAGE).find((f) => f.endsWith('.tgz'))
const distSize = execSync(`du -sh ${path.join(STAGE, 'dist')}`)
  .toString()
  .split('\t')[0]
console.log(`stage dist: ${distSize}`)
console.log(
  `tarball: ${path.join(STAGE, tarball)} (${(fs.statSync(path.join(STAGE, tarball)).size / 1024 / 1024).toFixed(1)}MB)`,
)
