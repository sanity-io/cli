/**
 * Runtime helper for JIT-installed oclif plugin commands.
 *
 * Heavy, project-shaped command groups (typegen, functions, blueprints) are not
 * shipped in the base install. On first use the real plugin package is resolved
 * from the current project's node_modules, or installed once into
 * ~/.sanity/cli-jit and loaded from there.
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {Command} from '@oclif/core'

function resolvePackageRoot(name, versionSpec, log) {
  // 1) the current project may already have it installed
  try {
    const req = createRequire(path.join(process.cwd(), '__jit_resolve__.js'))
    const entry = req.resolve(`${name}/package.json`)
    return path.dirname(entry)
  } catch {
    // fall through to the shared cache
  }

  // 2) shared per-user cache, installed on demand
  const cacheKey = `${name.replace(/\//g, '__')}@${versionSpec.replace(/[\^~]/g, '')}`
  const cacheDir = path.join(os.homedir(), '.sanity', 'cli-jit', cacheKey)
  const pkgJson = path.join(cacheDir, 'node_modules', name, 'package.json')
  if (!fs.existsSync(pkgJson)) {
    log(`One-time setup: installing ${name}…`)
    fs.mkdirSync(cacheDir, {recursive: true})
    const res = spawnSync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--prefix', cacheDir, `${name}@${versionSpec}`],
      {stdio: ['ignore', 'ignore', 'inherit']},
    )
    if (res.status !== 0) {
      throw new Error(`Failed to install ${name}. Try: npm install -D ${name}`)
    }
  }
  return path.dirname(pkgJson)
}

export function makeJitCommand(pkgName, versionSpec, relativePath) {
  return class JitCommand extends Command {
    static strict = false

    async run() {
      const root = resolvePackageRoot(pkgName, versionSpec, (m) => this.log(m))
      const mod = await import(pathToFileURL(path.join(root, ...relativePath)).href)
      // like oclif's module loader: default export, or a named export that
      // looks like a command class (@sanity/codegen exports its command named)
      const Real =
        typeof mod.default?.run === 'function'
          ? mod.default
          : Object.values(mod).find((v) => typeof v?.run === 'function')
      if (!Real) {
        throw new Error(`No command class found in ${pkgName} ${relativePath.join('/')}`)
      }
      // Run with OUR loaded config so the command executes in the sanity CLI
      // context (bin name in messages, version, etc). oclif's Config check is
      // duck-typed, so the instance is accepted across @oclif/core copies.
      await Real.run(this.argv, this.config)
    }
  }
}
