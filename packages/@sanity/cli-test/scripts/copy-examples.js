#!/usr/bin/env node
/**
 * Copies specified examples from the repo root to the cli-test package.
 * This script runs during the build process to bundle examples with the package.
 */

// eslint-disable-next-line n/no-unsupported-features/node-builtins
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'

import {parse as parseYaml} from 'yaml'

const packageRoot = dirname(import.meta.dirname)
// Go up 3 levels to get to the repo root (packages/@sanity/cli-test -> packages/@sanity -> packages -> root)
const repoRoot = resolve(packageRoot, '../../..')
const sourceExamplesDir = join(repoRoot, 'examples')
const targetExamplesDir = join(packageRoot, 'examples')

// Copy all 4 examples
const EXAMPLES_TO_COPY = [
  'basic-app',
  'basic-studio',
  'multi-workspace-studio',
  'worst-case-studio',
]

/**
 * Parses the pnpm-workspace.yaml file and extracts the catalog section.
 * @param yamlPath - Path to the pnpm-workspace.yaml file
 * @returns Map of package names to versions
 */
async function parseCatalog(yamlPath) {
  const content = await readFile(yamlPath, 'utf8')
  const workspace = parseYaml(content)

  if (!workspace.catalog || typeof workspace.catalog !== 'object') {
    throw new Error('Could not find catalog section in pnpm-workspace.yaml')
  }

  const catalog = new Map()
  for (const [packageName, version] of Object.entries(workspace.catalog)) {
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
function transformPackageJson(content, catalog) {
  const pkg = JSON.parse(content)

  function transformDeps(deps) {
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

async function copyExamples() {
  console.log('Copying examples to cli-test package...')

  // Load catalog once at the start
  const catalog = await parseCatalog(join(repoRoot, 'pnpm-workspace.yaml'))

  await mkdir(targetExamplesDir, {recursive: true})

  for (const example of EXAMPLES_TO_COPY) {
    const sourceDir = join(sourceExamplesDir, example)
    const targetDir = join(targetExamplesDir, example)

    console.log(`  Copying ${example}...`)

    // Copy the example, excluding node_modules, dist, and .turbo
    await cp(sourceDir, targetDir, {
      filter: (src) => {
        const name = src.split('/').pop()
        return name !== 'node_modules' && name !== 'dist' && name !== '.turbo'
      },
      recursive: true,
    })

    // Transform package.json to resolve catalog: references
    const pkgJsonPath = join(targetDir, 'package.json')
    const originalContent = await readFile(pkgJsonPath, 'utf8')
    const transformedContent = transformPackageJson(originalContent, catalog)
    await writeFile(pkgJsonPath, transformedContent, 'utf8')
  }

  console.log('Examples copied successfully!')
}

await copyExamples().catch((error) => {
  console.error('Failed to copy examples:', error)
  process.exit(1)
})
