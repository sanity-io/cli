#!/usr/bin/env node

/**
 * Custom publish script that handles per-package npm dist tags.
 *
 * - @sanity/cli publishes with --tag alpha (prerelease)
 * - All other packages publish with --tag latest (default)
 *
 * This replaces `changeset publish` to support mixed tag publishing.
 */

import {execSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const ALPHA_PACKAGES = ['@sanity/cli']

// First, run changeset publish for non-alpha packages
// Then handle alpha packages separately
const rootDir = process.cwd()

// Get all workspace packages
const workspaceInfo = JSON.parse(
  execSync('pnpm ls -r --json --depth 0', {encoding: 'utf8'}),
)

// Separate packages by tag
const alphaFilters = ALPHA_PACKAGES.map((pkg) => `--filter="${pkg}"`).join(' ')
const nonAlphaPackages = ['@sanity/cli-core', '@sanity/cli-test', '@sanity/eslint-config-cli']
const nonAlphaFilters = nonAlphaPackages.map((pkg) => `--filter="${pkg}"`).join(' ')

console.log('Publishing packages with latest tag...')
try {
  execSync(`pnpm publish -r ${nonAlphaFilters} --no-git-checks`, {
    stdio: 'inherit',
    cwd: rootDir,
  })
} catch {
  console.log('Some packages may have already been published or have no changes.')
}

console.log('\nPublishing @sanity/cli with alpha tag...')
try {
  execSync(`pnpm publish -r ${alphaFilters} --tag alpha --no-git-checks`, {
    stdio: 'inherit',
    cwd: rootDir,
  })
} catch {
  console.log('@sanity/cli may have already been published or has no changes.')
}
