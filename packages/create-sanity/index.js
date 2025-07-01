#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {join} from 'node:path'

import {moduleResolve} from 'import-meta-resolve'

const args = process.argv.slice(2)

let cliBin
try {
  const cliPkgDir = await moduleResolve('@sanity/cli/package.json', import.meta.url)
  const cliDir = join(cliPkgDir.pathname, '..')
  cliBin = join(cliDir, 'bin', 'run.js')
} catch (err) {
  throw new Error('Failed to resolve `@sanity/cli` package', {cause: err})
}

spawn('node', [cliBin, 'init', ...args, '--from-create'], {stdio: 'inherit'})
