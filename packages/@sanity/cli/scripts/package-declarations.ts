import {existsSync, readFileSync, statSync} from 'node:fs'
import {readdir, rm} from 'node:fs/promises'
import {dirname, join, resolve, sep} from 'node:path'

import {
  type CompilerHost,
  type CompilerOptions,
  createCompilerHost,
  createProgram,
  getDefaultLibFilePath,
  ModuleKind,
  ModuleResolutionKind,
  preProcessFile,
  resolveModuleName,
  resolveTypeReferenceDirective,
} from 'typescript'

const TYPESCRIPT = /\.[cm]?tsx?$/

async function typescriptFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await typescriptFiles(path)))
    else if (TYPESCRIPT.test(entry.name)) files.push(path)
  }
  return files
}

const RESOLUTIONS = [
  {module: ModuleKind.ESNext, moduleResolution: ModuleResolutionKind.Bundler},
  {module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext},
  {module: ModuleKind.CommonJS, moduleResolution: ModuleResolutionKind.Node10},
]

/** A compiler host that sees the package in isolation, as installed. */
function isolatedHost(root: string, options: CompilerOptions): CompilerHost {
  const lib = resolve(getDefaultLibFilePath(options), '..')
  const inside = (path: string) =>
    resolve(path).startsWith(`${root}${sep}`) || resolve(path).startsWith(`${lib}${sep}`)
  const host = createCompilerHost(options)
  return {
    ...host,
    directoryExists: (path) => inside(path) && existsSync(path) && statSync(path).isDirectory(),
    fileExists: (path) => inside(path) && existsSync(path) && statSync(path).isFile(),
    getSourceFile: (path, ...args) =>
      inside(path) ? host.getSourceFile(path, ...args) : undefined,
    readFile: (path) => (inside(path) ? readFileSync(path, 'utf8') : undefined),
    realpath: (path) => path,
  }
}

/** TypeScript files the given roots reach, resolved only within `root`. */
function reachableTypeScript(root: string, entries: string[]): Set<string> {
  const reachable = new Set<string>()
  // A program finds every kind of type dependency, but loads one copy of
  // packages with the same name and version, so imports are also followed.
  for (const options of RESOLUTIONS) {
    const compilerOptions = {...options, noEmit: true, types: []}
    const program = createProgram({
      host: isolatedHost(root, compilerOptions),
      options: compilerOptions,
      rootNames: entries.map((entry) => resolve(root, entry)),
    })
    for (const file of program.getSourceFiles()) {
      if (resolve(file.fileName).startsWith(`${root}${sep}`)) reachable.add(resolve(file.fileName))
    }
  }
  const host = isolatedHost(root, {})
  const visited = new Set<string>()
  const queue = [...entries.map((entry) => resolve(root, entry)), ...reachable]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file) || !host.fileExists(file)) continue
    visited.add(file)
    reachable.add(file)
    const info = preProcessFile(readFileSync(file, 'utf8'), true, true)
    for (const {fileName} of info.referencedFiles) queue.push(resolve(dirname(file), fileName))
    const specifiers = [...info.importedFiles, ...info.typeReferenceDirectives].map(
      ({fileName}) => fileName,
    )
    for (const specifier of specifiers) {
      for (const options of RESOLUTIONS) {
        for (const mode of [ModuleKind.ESNext, ModuleKind.CommonJS] as const) {
          const {resolvedModule} = resolveModuleName(
            specifier,
            file,
            options,
            host,
            undefined,
            undefined,
            mode,
          )
          if (resolvedModule) queue.push(resolve(resolvedModule.resolvedFileName))
          const {resolvedTypeReferenceDirective} = resolveTypeReferenceDirective(
            specifier,
            file,
            options,
            host,
            undefined,
            undefined,
            mode,
          )
          if (resolvedTypeReferenceDirective?.resolvedFileName) {
            queue.push(resolve(resolvedTypeReferenceDirective.resolvedFileName))
          }
        }
      }
    }
  }
  return reachable
}

/**
 * Removes dependency TypeScript files the public entry points' types can't
 * reach under any module resolution a consumer might use: private
 * declarations and the sources some packages publish next to their builds.
 */
export async function pruneDeclarations(output: string, roots: string[]) {
  const reachable = reachableTypeScript(resolve(output), roots)
  const dist = resolve(output, 'dist')
  let removed = 0
  for (const file of await typescriptFiles(dist)) {
    if (reachable.has(file)) continue
    // The CLI's own declarations stay, for deep imports of its public modules.
    if (
      !file
        .slice(dist.length + 1)
        .split(sep)
        .includes('node_modules')
    )
      continue
    await rm(file)
    removed++
  }
  return {kept: reachable.size, removed}
}
