#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {realpathSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

// Spawn only when executed directly, so importing this module has no side
// effects. npm runs the bin through a symlink, hence the realpath comparison.
const isMain =
  Boolean(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isMain) {
  const args = process.argv.slice(2)

  let cliBin
  try {
    const cliPkgDir = fileURLToPath(import.meta.resolve('@sanity/cli/package.json'))
    const cliDir = dirname(cliPkgDir)

    // Read the package.json file and extract the bin path
    const pJson = await readFile(cliPkgDir, 'utf8')
    const pkgJson = JSON.parse(pJson)
    const binPath = pkgJson.bin?.['sanity']
    if (!binPath) {
      throw new Error('Failed to resolve `@sanity/cli` package')
    }

    cliBin = resolve(cliDir, binPath)
  } catch (err) {
    throw new Error('Failed to resolve `@sanity/cli` package', {cause: err})
  }

  const proc = spawn('node', [cliBin, 'init', ...args, '--from-create'], {stdio: 'inherit'})
  proc.on('exit', (code) => {
    process.exitCode = code
  })
}
