#!/usr/bin/env node
/**
 * Copies specified examples from the repo root to the cli-test package.
 * This script runs during the build process to bundle examples with the package.
 */
import {cp, mkdir} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const packageRoot = resolve(__dirname, '..')
const repoRoot = resolve(packageRoot, '../../..')
const sourceExamplesDir = join(repoRoot, 'examples')
const targetExamplesDir = join(packageRoot, 'examples')

// Copy all 4 examples
const EXAMPLES_TO_COPY = ['basic-app', 'basic-studio', 'multi-workspace-studio', 'worst-case-studio']

async function copyExamples() {
  console.log('Copying examples to cli-test package...')

  await mkdir(targetExamplesDir, {recursive: true})

  for (const example of EXAMPLES_TO_COPY) {
    const sourceDir = join(sourceExamplesDir, example)
    const targetDir = join(targetExamplesDir, example)

    console.log(`  Copying ${example}...`)

    // Copy the example, excluding node_modules, dist, and .turbo
    await cp(sourceDir, targetDir, {
      recursive: true,
      filter: (src) => {
        const name = src.split('/').pop()
        return name !== 'node_modules' && name !== 'dist' && name !== '.turbo'
      },
    })
  }

  console.log('Examples copied successfully!')
}

copyExamples().catch((error) => {
  console.error('Failed to copy examples:', error)
  process.exit(1)
})
