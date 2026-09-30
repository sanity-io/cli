import {existsSync, statSync} from 'node:fs'
import {mkdir, mkdtemp, readdir, readFile, rm, rmdir, writeFile} from 'node:fs/promises'
import {builtinModules, createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {basename, dirname, extname, join, relative, sep} from 'node:path'

import {init as initLexer, parse as parseCommonJs} from 'cjs-module-lexer'
import {build, type Plugin, transform} from 'esbuild'

const JS = /\.[cm]?js$/
const URL_MARKER = '__SANITY_PACKAGE_URL__:'
const IMPORT_MARKER = '__SANITY_PACKAGE_IMPORT__:'
const BUILTINS = new Set(builtinModules)

export interface BundleOptions {
  /** Relative JS files loaded by path at runtime: bins, exports, oclif commands and hooks */
  entries: Iterable<string>
  /** Bare specifiers resolved at runtime from the installing project, e.g. peer dependencies */
  external: Iterable<string>
  /** Package directories left untouched, such as toolchain adapters, relative to `output` */
  preserve: Iterable<string>
}

function toPosix(path: string) {
  return path.split(sep).join('/')
}

function packageName(specifier: string) {
  return specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')
}

function relativeSpecifier(from: string, to: string) {
  const path = toPosix(relative(dirname(from), to))
  return path.startsWith('.') ? path : `./${path}`
}

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function removeEmptyDirs(dir: string): Promise<boolean> {
  let empty = true
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isDirectory() && (await removeEmptyDirs(join(dir, entry.name)))) continue
    empty = false
  }
  if (empty) await rmdir(dir)
  return empty
}

/** Files referenced with `new URL('./file.js', import.meta.url)`, such as workers. */
export function findPathReferences(code: string): string[] {
  const references: string[] = []
  for (const match of code.matchAll(
    /new URL\(\s*(['"`])([^'"`]+\.[cm]?js)\1\s*,\s*import\.meta\.url\s*\)/g,
  )) {
    references.push(match[2])
  }
  return references
}

/**
 * File paths in string literals other than import and require specifiers:
 * relative paths, and file names such as `path.join(dir, 'task.worker.js')`.
 * Examples are scripts passed to `fork` or modules for a lazily created `require`.
 */
export function findPathLiterals(code: string): string[] {
  const references = new Set<string>()
  for (const match of code.matchAll(
    /(?<!\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])(\.{1,2}\/[^'"`\s]+|[\w.-]+\.[cm]?js)\1/g,
  )) {
    references.add(match[2])
  }
  return [...references]
}

/** Node's resolution of a relative module path to a JavaScript file */
function resolveFile(path: string): string | undefined {
  for (const candidate of [
    path,
    `${path}.js`,
    `${path}.cjs`,
    `${path}.mjs`,
    join(path, 'index.js'),
  ]) {
    if (JS.test(candidate) && existsSync(candidate) && !statSync(candidate).isDirectory())
      return candidate
  }
  return undefined
}

/** Relative module specifiers in static and dynamic imports. */
export function findRelativeImports(code: string): string[] {
  const references: string[] = []
  for (const match of code.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+\.[cm]?js)\1/g,
  )) {
    references.push(match[2])
  }
  return references
}

const CJS_NAMESPACE = 'sanity-commonjs-namespace'

/** Named exports Node gives a CommonJS module imported from an ES module */
export async function commonJsExports(file: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.has(file)) return []
  seen.add(file)
  await initLexer()
  const {exports, reexports} = parseCommonJs(await readFile(file, 'utf8'))
  const names = new Set(exports)
  const require = createRequire(file)
  for (const specifier of reexports) {
    try {
      const target = require.resolve(specifier)
      if (JS.test(target)) for (const name of await commonJsExports(target, seen)) names.add(name)
    } catch {
      // Node skips re-exports it can't resolve.
    }
  }
  names.delete('default')
  return [...names].toSorted()
}

/** An ES module with Node's view of a CommonJS module's exports */
export function commonJsWrapper(file: string, names: string[]): string {
  const bindings = names.map(
    (name, index) =>
      `const e${index} = m[${JSON.stringify(name)}];\nexport {e${index} as ${JSON.stringify(name)}};`,
  )
  return `const m = require(${JSON.stringify(file)});\nexport default m;\n${bindings.join('\n')}\n`
}

const LOCATION = /\bimport\.meta\.(?:url|dirname|filename)\b|\b__(?:dirname|filename)\b/

/**
 * Rewrites location-dependent expressions so bundled code keeps pointing at
 * the file it came from. Placeholders are resolved per output file afterwards.
 */
export async function relocate(source: string, file: string, commonjs: boolean): Promise<string> {
  if (!LOCATION.test(source)) return source
  const url = JSON.stringify(`${URL_MARKER}${file}`)
  const define: Record<string, string> = {
    'import.meta.dirname': '__sanityModuleDirname',
    'import.meta.filename': '__sanityModuleFilename',
    'import.meta.url': '__sanityModuleUrl',
  }
  // Only CommonJS modules have these; ES modules may declare their own.
  if (commonjs)
    Object.assign(define, {
      __dirname: '__sanityModuleDirname',
      __filename: '__sanityModuleFilename',
    })
  const {code} = await transform(source, {charset: 'utf8', define, loader: 'js', target: 'esnext'})
  const hashbang = /^#![^\n]*\n/.exec(code)?.[0] ?? ''
  const body = code.slice(hashbang.length)
  const [fileURLToPath, dirname] = commonjs
    ? ['require("node:url").fileURLToPath', 'require("node:path").dirname']
    : ['__sanityFileURLToPath', '__sanityDirname']
  const imports = commonjs
    ? ''
    : 'import {fileURLToPath as __sanityFileURLToPath} from "node:url";import {dirname as __sanityDirname} from "node:path";'
  // Additions go after a hashbang, which esbuild keeps at the top.
  return `${hashbang}${imports}var __sanityModuleUrl=${url},__sanityModuleFilename=${fileURLToPath}(__sanityModuleUrl),__sanityModuleDirname=${dirname}(__sanityModuleFilename);\n${body}`
}

/** Resolves placeholders relative to the output file that contains them. */
export function resolvePlaceholders(code: string, file: string, root: string): string {
  return code
    .replaceAll(
      new RegExp(`(["'\`])${IMPORT_MARKER}([^"'\`]+)\\1`, 'g'),
      (_, quote: string, target: string) =>
        `${quote}${relativeSpecifier(file, join(root, target))}${quote}`,
    )
    .replaceAll(
      new RegExp(`(["'\`])${URL_MARKER}([^"'\`]+)\\1`, 'g'),
      (_, _quote: string, target: string) =>
        `new URL(${JSON.stringify(relativeSpecifier(file, join(root, target)))},import.meta.url).href`,
    )
}

/**
 * Bundle the packaged CLI and its private dependency tree into shared chunks.
 * npm then extracts a few hundred files instead of thousands, and Node parses
 * one copy of each module. Files loaded by path keep their location.
 */
export async function bundlePackage(output: string, options: BundleOptions) {
  const preserve: string[] = []
  const external = new Set(options.external)
  const isPreserved = (path: string) =>
    preserve.some((dir) => path === dir || path.startsWith(`${dir}${sep}`))
  const entries = new Set([...options.entries].map((entry) => join(output, entry)))
  for (const entry of entries) {
    if (!existsSync(entry))
      throw new Error(`Missing bundle entry ${toPosix(relative(output, entry))}`)
  }

  /** Leaves a package and its dependencies on disk, unbundled. */
  async function addPreserved(dir: string) {
    if (isPreserved(dir)) return
    preserve.push(dir)
    // Preserved packages may import bundled modules by path, like toolchain adapters.
    for (const file of await listFiles(dir)) {
      if (!JS.test(file)) continue
      for (const reference of findRelativeImports(await readFile(file, 'utf8'))) {
        const target = join(dirname(file), reference)
        if (!isPreserved(target)) entries.add(target)
      }
    }
  }

  /** A package preserved for its own dynamic loading keeps its dependencies too. */
  async function addPreservedWithDependencies(dir: string) {
    if (isPreserved(dir)) return
    await addPreserved(dir)
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    for (const name of Object.keys({...pkg.dependencies, ...pkg.optionalDependencies})) {
      for (let parent = dir; parent.startsWith(output); parent = dirname(parent)) {
        const candidate = join(parent, 'node_modules', name)
        if (existsSync(join(candidate, 'package.json'))) {
          await addPreservedWithDependencies(candidate)
          break
        }
      }
    }
  }

  for (const dir of options.preserve) await addPreserved(join(output, dir))

  /** The dependency package a file belongs to, if any */
  function dependencyRoot(file: string): string | undefined {
    for (let dir = dirname(file); dir.startsWith(output); dir = dirname(dir)) {
      const parent = basename(dirname(dir)).startsWith('@') ? dirname(dirname(dir)) : dirname(dir)
      if (basename(parent) === 'node_modules' && existsSync(join(dir, 'package.json'))) return dir
    }
    return undefined
  }

  const unresolved = new Set<string>()
  const dynamic = new Set<string>()
  const relocatePlugin: Plugin = {
    name: 'sanity-relocate',
    setup(pluginBuild) {
      pluginBuild.onResolve({filter: /.*/}, async (args) => {
        if (args.pluginData === 'resolving') return
        const specifier = args.path
        if (specifier.startsWith('node:') || BUILTINS.has(specifier)) {
          return {external: true, path: specifier}
        }
        if (
          !specifier.startsWith('.') &&
          !specifier.startsWith('/') &&
          external.has(packageName(specifier))
        )
          return {external: true, path: specifier}
        const result = await pluginBuild.resolve(specifier, {
          importer: args.importer,
          kind: args.kind,
          pluginData: 'resolving',
          resolveDir: args.resolveDir,
        })
        const outside = !result.external && relative(output, result.path).startsWith('..')
        if (outside && (specifier.startsWith('.') || specifier.startsWith('/'))) {
          throw new Error(
            `${specifier} from ${toPosix(relative(output, args.importer))} is outside the package`,
          )
        }
        if (result.errors.length > 0 || outside) {
          // Optional dependencies may be absent; Node reports them when used.
          unresolved.add(`${specifier} (from ${toPosix(relative(output, args.importer))})`)
          return {external: true, path: specifier}
        }
        if (result.external) return result
        const esm = await moduleBuildForUmd(result.path)
        if (esm) return {...result, path: esm}
        if (isPreserved(result.path)) {
          return {external: true, path: `${IMPORT_MARKER}${toPosix(relative(output, result.path))}`}
        }
        if (args.kind === 'dynamic-import' && JS.test(result.path)) {
          const code = await readFile(result.path, 'utf8')
          if (!(await isModule(result.path, code)))
            return {namespace: CJS_NAMESPACE, path: result.path}
        }
        return result
      })
      // With code splitting, esbuild gives `import()` of CommonJS only a
      // default export. Node also exports the names its lexer detects.
      pluginBuild.onLoad({filter: /.*/, namespace: CJS_NAMESPACE}, async (args) => ({
        contents: commonJsWrapper(args.path, await commonJsExports(args.path)),
        loader: 'js',
        resolveDir: dirname(args.path),
      }))
      pluginBuild.onLoad({filter: JS}, async (args) => {
        const code = await readFile(args.path, 'utf8')
        const file = toPosix(relative(output, args.path))
        const relocated = await relocate(code, file, !(await isModule(args.path, code)))
        return {
          contents: relocated,
          loader: 'js',
          resolveDir: dirname(args.path),
        }
      })
    },
  }

  /**
   * UMD modules hide their requires in a factory. A package's `module` build
   * of the same code is bundled instead.
   */
  async function moduleBuildForUmd(file: string): Promise<string | undefined> {
    for (let dir = dirname(file); dir.startsWith(output); dir = dirname(dir)) {
      const manifest = join(dir, 'package.json')
      if (!existsSync(manifest)) continue
      const pkg = JSON.parse(await readFile(manifest, 'utf8'))
      if (typeof pkg.module !== 'string' || typeof pkg.main !== 'string') return undefined
      const main = join(dir, pkg.main)
      if (![`${main}.js`, main].includes(file)) return undefined
      if (!/\bdefine\.amd\b/.test(await readFile(file, 'utf8'))) return undefined
      return join(dir, pkg.module)
    }
    return undefined
  }

  const moduleTypes = new Map<string, boolean>()
  /** Node's module type for a file: extension, then the nearest package.json */
  async function isModule(file: string, code: string): Promise<boolean> {
    if (file.endsWith('.mjs')) return true
    if (file.endsWith('.cjs')) return false
    for (let dir = dirname(file); dir.startsWith(output); dir = dirname(dir)) {
      const manifest = join(dir, 'package.json')
      if (!moduleTypes.has(manifest) && existsSync(manifest)) {
        const pkg = JSON.parse(await readFile(manifest, 'utf8'))
        moduleTypes.set(manifest, pkg.type === 'module')
      }
      if (moduleTypes.has(manifest)) {
        // Without a module type, Node detects ES module syntax.
        return moduleTypes.get(manifest)! || /\bimport\.meta\b/.test(code)
      }
    }
    return false
  }

  const scratch = await mkdtemp(join(tmpdir(), 'sanity-cli-bundle-'))
  try {
    // Workers and other files loaded by path become entries as they are found.
    let inputs: string[] = []
    for (;;) {
      const result = await build({
        banner: {
          js: "import {createRequire as __sanityCreateRequire} from 'node:module';const require=__sanityCreateRequire(import.meta.url);",
        },
        bundle: true,
        charset: 'utf8',
        chunkNames: 'dist/_chunks/[name]-[hash]',
        // Resolve like Node does, so every module keeps its runtime format.
        conditions: [],
        entryNames: '[dir]/[name]',
        entryPoints: [...entries].filter((entry) => !isPreserved(entry)),
        format: 'esm',
        keepNames: true,
        legalComments: 'inline',
        logLevel: 'silent',
        mainFields: ['main'],
        metafile: true,
        minify: true,
        outbase: output,
        outdir: scratch,
        platform: 'node',
        plugins: [relocatePlugin],
        splitting: true,
        target: 'node22',
        // The workspace tsconfig maps packages to sources; resolve like Node.
        tsconfigRaw: {},
        write: false,
      })
      inputs = Object.keys(result.metafile.inputs)
        .filter((input) => !input.startsWith(`${CJS_NAMESPACE}:`))
        .map((input) => join(process.cwd(), input))
      const before = entries.size + preserve.length
      for (const input of inputs) {
        if (!JS.test(input) || !existsSync(input)) continue
        const code = await readFile(input, 'utf8')
        for (const reference of findPathReferences(code)) {
          const target = join(dirname(input), reference)
          if (existsSync(target) && !isPreserved(target)) entries.add(target)
        }
        // Modules loaded by computed paths stay invisible to the bundler, such
        // as scripts passed to `fork` or jiti's lazily required Babel build.
        const root = dependencyRoot(input)
        if (root && isPreserved(root)) continue
        for (const reference of findPathLiterals(code)) {
          const target = resolveFile(join(dirname(input), reference))
          if (!target || entries.has(target) || isPreserved(target)) continue
          if (dependencyRoot(target) !== root) continue
          if (await isModule(target, await readFile(target, 'utf8'))) {
            // Bundled in place, as for files loaded with `new URL()`.
            entries.add(target)
            continue
          }
          if (!root || !reference.startsWith('.')) continue
          // CommonJS loaded by path keeps its package's files as published.
          dynamic.add(
            `${toPosix(relative(output, root))} (${reference} from ${toPosix(relative(root, input))})`,
          )
          await addPreservedWithDependencies(root)
          break
        }
      }
      if (entries.size + preserve.length === before) {
        for (const file of result.outputFiles) {
          const target = join(output, relative(scratch, file.path))
          const code = resolvePlaceholders(file.text, target, output)
          const leftover = code.match(/__SANITY_PACKAGE_(?:URL|IMPORT)__:[^"'`]*/)
          if (leftover) {
            throw new Error(
              `Unresolved bundle placeholder in ${relative(scratch, file.path)}: ${leftover[0]}`,
            )
          }
          file.contents = Buffer.from(code)
        }
        // Bundled code that reads a package.json at runtime needs it in place.
        const manifestReaders = new Set<string>()
        for (const input of inputs) {
          if (!JS.test(input) || !(await readFile(input, 'utf8')).includes('package.json')) continue
          for (let dir = dirname(input); dir.startsWith(output); dir = dirname(dir)) {
            if (existsSync(join(dir, 'package.json'))) {
              manifestReaders.add(toPosix(relative(output, dir)))
              break
            }
          }
        }
        await removeBundledSources(output, isPreserved)
        for (const file of result.outputFiles) {
          const target = join(output, relative(scratch, file.path))
          await mkdir(dirname(target), {recursive: true})
          await writeFile(target, file.contents)
        }
        await markModulePackages(output, [...entries], isPreserved)
        await removeEmptyDirs(join(output, 'dist'))
        return {
          dynamic: [...dynamic].toSorted(),
          entries: [...entries].map((entry) => toPosix(relative(output, entry))),
          manifestReaders: [...manifestReaders].toSorted(),
          unresolved: [...unresolved].toSorted(),
        }
      }
    }
  } finally {
    await rm(scratch, {force: true, recursive: true})
  }
}

/** JavaScript outside preserved packages is replaced by the bundle output. */
async function removeBundledSources(output: string, isPreserved: (path: string) => boolean) {
  for (const file of await listFiles(join(output, 'dist'))) {
    if (isPreserved(file)) continue
    if (JS.test(file)) await rm(file)
    else if (
      /(?:^|[/\\])(?:readme|changelog|history)(?:\.[^/\\]*)?$/i.test(file) &&
      file.includes(`${sep}node_modules${sep}`)
    )
      await rm(file)
  }
}

/** Bundled entries are ES modules, including those in CommonJS packages. */
async function markModulePackages(
  output: string,
  entries: string[],
  isPreserved: (path: string) => boolean,
) {
  const manifests = new Set<string>()
  for (const entry of entries) {
    if (extname(entry) !== '.js') continue
    for (let dir = dirname(entry); dir.startsWith(output); dir = dirname(dir)) {
      const manifest = join(dir, 'package.json')
      if (existsSync(manifest)) {
        manifests.add(manifest)
        break
      }
    }
  }
  for (const manifest of manifests) {
    if (isPreserved(manifest)) continue
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    if (pkg.type === 'module') continue
    pkg.type = 'module'
    await writeFile(manifest, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
