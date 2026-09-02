/* eslint-disable no-console */
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'sanity-cli-install-size-'))
const installRoot = join(temporaryRoot, 'install')
const tarballPath = join(temporaryRoot, 'sanity-cli.tgz')
let cleanedUp = false
let childProcess

function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  rmSync(temporaryRoot, {force: true, recursive: true})
}

process.once('exit', cleanup)

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    childProcess?.kill(signal)
    cleanup()
    process.exit(exitCode)
  })
}

async function run(command, args, failureMessage, cwd = repoRoot) {
  childProcess = execa(command, args, {
    cleanup: true,
    cwd,
    killDescendants: true,
    reject: false,
    stdio: 'inherit',
  })
  const result = await childProcess
  childProcess = undefined
  if (result.failed) {
    throw new Error(`${failureMessage} Fix the errors above and run the script again.`)
  }
}

async function runInspector() {
  childProcess = execa('pnpm', ['dlx', 'node-modules-inspector@latest', '--root', installRoot], {
    cleanup: true,
    cwd: repoRoot,
    killDescendants: true,
    reject: false,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const inspectorProcess = childProcess
  const exited = inspectorProcess

  let onInput
  const input = new Promise((resolveInput) => {
    onInput = () => resolveInput('input')
    process.stdin.once('data', onInput)
  })

  process.stdin.resume()
  console.log('Press Enter to stop the inspector and remove the temporary install.')

  try {
    const outcome = await Promise.race([exited, input])
    if (outcome === 'input') {
      inspectorProcess.kill()
      await exited
      return
    }

    if (outcome.failed) {
      throw new Error(
        `Node Modules Inspector stopped unexpectedly${outcome.signal ? ` (${outcome.signal})` : ''}.`,
      )
    }
  } finally {
    if (onInput) process.stdin.off('data', onInput)
    process.stdin.pause()
    childProcess = undefined
  }
}

try {
  console.log('Building @sanity/cli…')
  await run('pnpm', ['build:cli'], "Couldn't build @sanity/cli.")

  console.log('\nPacking @sanity/cli…')
  await run(
    'pnpm',
    ['--dir', 'packages/@sanity/cli', 'pack', '--out', tarballPath],
    "Couldn't pack @sanity/cli.",
  )

  mkdirSync(installRoot)

  console.log('\nInstalling the packed CLI in a temporary project…')
  await run(
    'pnpm',
    ['--config.minimum-release-age=0', 'add', '--save-exact', '--prod', tarballPath],
    "Couldn't install the packed CLI.",
    installRoot,
  )

  console.log(`\nStarting Node Modules Inspector for ${installRoot}`)
  await runInspector()
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  cleanup()
}
