#!/usr/bin/env node
/**
 * Copies specified fixtures from the repo root to the cli-test package.
 * This script runs during the build process to bundle fixtures with the package.
 */

// eslint-disable-next-line n/no-unsupported-features/node-builtins
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'

import {parse as parseYaml} from 'yaml'

import {DEFAULT_FIXTURES} from '../src/index.js'

const packageRoot = dirname(import.meta.dirname)
// Go up 3 levels to get to the repo root (packages/@sanity/cli-test -> packages/@sanity -> packages -> root)
const repoRoot = resolve(packageRoot, '../../..')
const sourceFixturesDir = join(repoRoot, 'fixtures')
const targetFixturesDir = join(packageRoot, 'fixtures')

/**
 * Parses the pnpm-workspace.yaml file and extracts the catalog section.
 * @param yamlPath - Path to the pnpm-workspace.yaml file
 * @returns Map of package names to versions
 */
async function parseCatalog(yamlPath: string) {
  const content = await readFile(yamlPath, 'utf8')
  const workspace = parseYaml(content)

  if (!workspace.catalog || typeof workspace.catalog !== 'object') {
    throw new Error('Could not find catalog section in pnpm-workspace.yaml')
  }

  const catalog = new Map<string, string>()
  for (const [packageName, version] of Object.entries(workspace.catalog)) {
    if (typeof version !== 'string') {
      throw new TypeError(`Invalid version for package ${packageName} in catalog`)
    }

    catalog.set(packageName, version)
  }

  return catalog
}

/**
 * Transforms package.json content by replacing catalog: references with actual versions.
 * @param content - The package.json content as a string
 * @param catalog - Map of package names to versions from the catalog
 * @returns Transformed package.json content
 */
function transformPackageJson(content: string, catalog: Map<string, string>): string {
  const pkg = JSON.parse(content)

  function transformDeps(deps: Record<string, string> | undefined) {
    if (!deps) return

    for (const [name, version] of Object.entries(deps)) {
      if (version === 'catalog:') {
        const catalogVersion = catalog.get(name)
        if (!catalogVersion) {
          throw new Error(`Catalog version not found for package: ${name}`)
        }
        deps[name] = catalogVersion
      }
    }
  }

  transformDeps(pkg.dependencies)
  transformDeps(pkg.devDependencies)

  return JSON.stringify(pkg, null, 2) + '\n'
}

async function copyFixtures() {
  console.log('Copying fixtures to cli-test package...')

  // Load catalog once at the start
  const catalog = await parseCatalog(join(repoRoot, 'pnpm-workspace.yaml'))

  await mkdir(targetFixturesDir, {recursive: true})

  for (const [fixture, options] of Object.entries(DEFAULT_FIXTURES)) {
    const sourceDir = join(sourceFixturesDir, fixture)
    const targetDir = join(targetFixturesDir, fixture)

    console.log(`  Copying ${fixture}...`)

    // Copy the fixture, excluding node_modules, .turbo and (unless specified) dist directories
    await cp(sourceDir, targetDir, {
      filter: (src) => {
        const name = src.split('/').pop()
        return (
          name !== 'node_modules' &&
          name !== '.turbo' &&
          (name !== 'dist' || options.includeDist === true)
        )
      },
      recursive: true,
    })

    // Transform package.json to resolve catalog: references
    const pkgJsonPath = join(targetDir, 'package.json')
    const originalContent = await readFile(pkgJsonPath, 'utf8')
    const transformedContent = transformPackageJson(originalContent, catalog)
    await writeFile(pkgJsonPath, transformedContent, 'utf8')
  }

  console.log('Fixtures copied successfully!')
}

await copyFixtures().catch((error) => {
  console.error('Failed to copy fixtures:', error)
  process.exit(1)
})
