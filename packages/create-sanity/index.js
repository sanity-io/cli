#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'

const args = process.argv.slice(2)

let cliBin
try {
  const cliPkgDir = fileURLToPath(await moduleResolve('@sanity/cli/package.json', import.meta.url))
  const cliDir = join(cliPkgDir, '..')

  // Read the package.json file and extract the bin path
  const pJson = await readFile(cliPkgDir, 'utf8')
  const pkgJson = JSON.parse(pJson)
  const binPath = pkgJson.bin?.['sanity']
  if (!binPath) {
    throw new Error('Failed to resolve `@sanity/cli` package')
  }

  cliBin = join(cliDir, binPath)
} catch (err) {
  throw new Error('Failed to resolve `@sanity/cli` package', {cause: err})
}

const proc = spawn('node', [cliBin, 'init', ...args, '--from-create'], {stdio: 'inherit'})
proc.on('exit', (code) => {
  process.exitCode = code
})
