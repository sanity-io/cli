import {mkdir, readFile, unlink, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

import {type Options, transform} from '@swc/core'
import {type FSWatcher, watch} from 'chokidar'
import {glob} from 'tinyglobby'

let watcher: FSWatcher | null = null
const compiledFiles: Set<string> = new Set()

// Shared SWC configuration for worker compilation
const swcOptions: Options = {
  isModule: true,
  jsc: {
    parser: {
      syntax: 'typescript' as const,
      tsx: true,
    },
    target: 'es2023' as const,
    transform: {
      react: {
        runtime: 'automatic' as const,
      },
    },
  },
  sourceMaps: true,
}

export async function setup() {
  console.log('Setting up worker build with SWC...')
  await setupSWC()

  // Set up watch mode if in watch mode
  if (process.env.VITEST_WATCH === 'true' || process.argv.includes('--watch')) {
    setupWatchMode()
  }
}

export async function teardown() {
  if (watcher) {
    await watcher.close()
  }

  // Clean up compiled JavaScript files
  console.log('Cleaning up compiled JavaScript files...')
  for (const filePath of compiledFiles) {
    try {
      await unlink(filePath)
      console.log(`✓ Deleted ${filePath}`)
    } catch (error) {
      console.error(`Failed to delete ${filePath}:`, error)
    }
  }
  compiledFiles.clear()
}

async function setupSWC() {
  // Find all .worker.ts files in both CLI and CLI-core packages
  const workerFiles = await glob('**/*.worker.ts', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  // Also find worker files in cli-core package (relative to CLI package)
  const cliCoreWorkerFiles = await glob('../cli-core/src/**/*.worker.ts', {
    cwd: process.cwd(),
  })

  const allWorkerFiles = [...workerFiles, ...cliCoreWorkerFiles]

  console.log(`Found ${allWorkerFiles.length} worker files to setup with SWC`)

  // Compile each worker file
  for (const workerFile of allWorkerFiles) {
    try {
      await compileWorkerFile(workerFile)
      console.log(`✓ Compiled ${workerFile} with SWC`)
    } catch (error) {
      console.error(`✗ Failed to compile ${workerFile}:`, error)
      throw error
    }
  }
}

function setupWatchMode() {
  console.log('Setting up watch mode for worker files with SWC...')

  watcher = watch(['**/*.worker.ts', '../cli-core/src/**/*.worker.ts'], {
    ignored: ['node_modules/**', 'dist/**'],
    persistent: true,
  })

  watcher.on('change', async (filePath: string) => {
    console.log(`Worker file changed: ${filePath}`)
    try {
      await compileWorkerFile(filePath)
      console.log(`✓ Recompiled ${filePath} with SWC`)
    } catch (error) {
      console.error(`Failed to recompile ${filePath}:`, error)
    }
  })

  watcher.on('add', async (filePath: string) => {
    console.log(`New worker file added: ${filePath}`)
    try {
      await compileWorkerFile(filePath)
      console.log(`✓ Compiled new file ${filePath} with SWC`)
    } catch (error) {
      console.error(`Failed to compile new file ${filePath}:`, error)
    }
  })
}

async function compileWorkerFile(filePath: string) {
  const sourceCode = await readFile(filePath, 'utf8')
  const result = await transform(sourceCode, {
    filename: filePath,
    ...swcOptions,
  })

  // Write compiled file next to the source file
  const outputFile = filePath.replace(/\.ts$/, '.js')
  await mkdir(dirname(outputFile), {recursive: true})
  await writeFile(outputFile, result.code)

  // Track the compiled file for cleanup
  compiledFiles.add(outputFile)

  return outputFile
}
