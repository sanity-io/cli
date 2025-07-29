import {exec as execNode} from 'node:child_process'
import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {testCopyDirectory} from './helpers/testExample.js'

const exec = promisify(execNode)

export async function setup() {
  console.log('Initializing test environment...')
  // Clone all the examples to the tmp directory
  const examplesDir = join(process.cwd(), 'examples')
  const examples = await readdir(examplesDir)

  const tempDir = join(process.cwd(), 'tmp')
  for (const example of examples) {
    if (example.startsWith('.')) {
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
    const {stderr} = await exec(`pnpm install --prefer-offline --no-lockfile`, {
      cwd: toPath,
    })
    if (stderr) {
      console.error(stderr)
      throw new Error(`Error installing dependencies in ${toPath}`)
    }
  }

  console.log('Test environment initialized')
}

export async function teardown() {
  const tempTestDir = join(process.cwd(), 'tmp')

  // Remove the tmp directory
  await rm(tempTestDir, {force: true, recursive: true})
}
