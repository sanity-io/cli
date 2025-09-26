import {exec as execNode} from 'node:child_process'
import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

import spinner from 'ora'

import {testCopyDirectory} from './helpers/testExample.js'

const exec = promisify(execNode)

// Add examples to copy here
const examplesToCopy = new Set(['basic-app', 'basic-studio', 'worst-case-studio'])

export async function setup() {
  const spin = spinner({
    // Without this, the watch mode input is discarded
    discardStdin: false,
    text: 'Initializing test environment...',
  }).start()
  // Clone all the examples to the tmp directory
  const examplesDir = join(process.cwd(), 'examples')
  const examples = await readdir(examplesDir)

  const tempDir = join(process.cwd(), 'tmp')

  const buildPromises = []

  for (const example of examples) {
    if (example.startsWith('.') || !examplesToCopy.has(example)) {
      continue
    }

    const fromPath = join(examplesDir, example)
    const toPath = join(tempDir, `example-${example}`)
    await testCopyDirectory(fromPath, toPath, ['node_modules', 'dist'])

    // Replace the package.json name with a temp name
    const packageJsonPath = join(toPath, 'package.json')
    const packageJson = await readFile(packageJsonPath, 'utf8')
    const packageJsonData = JSON.parse(packageJson)
    packageJsonData.name = `${packageJsonData.name}-test`
    await writeFile(packageJsonPath, JSON.stringify(packageJsonData, null, 2))

    // Run pnpm install --no-lockfile in the temp directory
    try {
      await exec(`pnpm install --prefer-offline --no-lockfile`, {
        cwd: toPath,
      })
    } catch (error) {
      const execError = error as {message: string; stderr?: string}
      console.error(execError.stderr || execError.message)
      throw new Error(
        `Error installing dependencies in ${toPath}: ${execError.stderr || execError.message}`,
      )
    }

    buildPromises.push(
      exec('npx sanity build --yes', {
        cwd: toPath,
      }),
    )
  }

  try {
    await Promise.all(buildPromises)
    spin.succeed('Test environment initialized')
  } catch (error) {
    spin.fail('Failed to initialize test environment')
    throw error
  }
}

export async function teardown() {
  const tempTestDir = join(process.cwd(), 'tmp')

  // Remove the tmp directory
  await rm(tempTestDir, {force: true, recursive: true})
}
