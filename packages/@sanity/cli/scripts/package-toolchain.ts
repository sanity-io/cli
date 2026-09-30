import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {cp, mkdir, readFile, realpath, writeFile} from 'node:fs/promises'
import {dirname, join, relative, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'
import {moduleResolve} from 'import-meta-resolve'

import {type Manifest, type ToolchainPackage} from './package-dependencies.js'

/** Keep types/assets in the package, and load native implementations from the local cache. */
export async function prepareToolchain(
  stage: string,
  output: string,
  packages: Map<string, ToolchainPackage>,
) {
  const deferred: Record<string, string> = {}
  const aliases = new Map<string, string>()
  for (const [path, {name, version}] of packages) {
    let alias = name
    if (deferred[name] && deferred[name] !== version) {
      alias = `sanity-cli-tool-${createHash('sha256').update(`${name}@${version}`).digest('hex').slice(0, 12)}`
      deferred[alias] = `npm:${name}@${version}`
    } else {
      deferred[name] = version
    }
    aliases.set(path, alias)
  }
  for (const [packagePath, {name}] of packages) {
    const path = await realpath(packagePath)
    const dest = join(output, 'dist', relative(stage, packagePath))
    await cp(path, dest, {
      dereference: true,
      filter: (file) =>
        !relative(path, file).split(sep).includes('node_modules') &&
        !file.endsWith('.map') &&
        (name === 'vite' || !/\.(?:[cm]?js|node|wasm)$/.test(file)),
      recursive: true,
    })
    const pkg: Manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
    const original = pkg.exports
    const exports: Record<string, unknown> =
      original &&
      typeof original === 'object' &&
      Object.keys(original).some((key) => key.startsWith('.'))
        ? (original as Record<string, unknown>)
        : {'.': original ?? pkg.main}
    const subpaths = Object.keys(exports).filter(
      (key) => !key.includes('*') && key !== './package.json' && key !== './client',
    )
    for (const subpath of subpaths) {
      const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`
      let url: URL
      try {
        url = moduleResolve(specifier, pathToFileURL(join(path, 'entry.js')))
      } catch (error) {
        if (
          subpath !== '.' &&
          (error as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        )
          continue
        throw error
      }
      const library = await doImport(url.href)
      const sourceFile = relative(path, fileURLToPath(url))
      if (sourceFile.startsWith('..'))
        throw new Error(`Unexpected export outside ${name}: ${specifier}`)
      const file = sourceFile.replace(/\.[cm]?js$/, '.sanity-loader.mjs')
      const adapter = join(dest, file)
      const helper = relative(dirname(adapter), join(output, 'dist/util/toolchain.js'))
        .split(sep)
        .join('/')
      const bindings = Object.keys(library)
        .map(
          (key, index) =>
            `const binding${index} = library[${JSON.stringify(key)}];\nexport {binding${index} as ${JSON.stringify(key)}};`,
        )
        .join('\n')
      await mkdir(dirname(adapter), {recursive: true})
      await writeFile(
        adapter,
        `import {loadToolchainModule} from ${JSON.stringify(helper.startsWith('.') ? helper : `./${helper}`)};\nconst library = await loadToolchainModule(${JSON.stringify(`${aliases.get(packagePath)}${subpath === '.' ? '' : subpath.slice(1)}`)}, ${JSON.stringify(deferred)});\n${bindings}\n`,
      )
      const declaration = sourceFile
        .replace(/\.mjs$/, '.d.mts')
        .replace(/\.cjs$/, '.d.cts')
        .replace(/(?<!\.d)\.js$/, '.d.ts')
      const types =
        (subpath === '.' ? pkg.types : undefined) ??
        (existsSync(join(path, declaration)) ? declaration : undefined)
      const mapping = exports[subpath]
      const conditions = typeof mapping === 'object' && mapping ? mapping : {}
      exports[subpath] = {
        ...(typeof types === 'string' ? {types: types.startsWith('.') ? types : `./${types}`} : {}),
        ...conditions,
        default: `./${file}`,
        import: `./${file}`,
        require: `./${file}`,
      }
    }
    pkg.exports = exports
    await writeFile(join(dest, 'package.json'), JSON.stringify(pkg, null, 2))
  }
}
