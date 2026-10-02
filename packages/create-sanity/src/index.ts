import {spawn} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {styleText} from 'node:util'

import {parseInitArgs, stripSeparators} from './flags.js'
import {helpText} from './help.js'
import {initStudio, isNextJsProject} from './init.js'
import {pinnedCliCommand, spawnArgs} from './runner.js'
import {exitCodes, InitError, isInteractive} from './ui.js'

declare const __SANITY_CLI_VERSION__: string

const CLI_VERSION = __SANITY_CLI_VERSION__
// The build copies the Studio templates next to the bundle
const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates')

function runChild(command: string, args: string[], env = process.env): Promise<number> {
  return new Promise((resolve) => {
    const spawned = spawnArgs(command, args)
    const child = spawn(spawned.command, spawned.args, {
      env,
      shell: spawned.shell,
      stdio: 'inherit',
    })
    child.on('error', (error) => {
      process.stderr.write(`${error.message}\n`)
      resolve(exitCodes.RUNTIME_ERROR)
    })
    child.on('close', (code) => resolve(code ?? exitCodes.RUNTIME_ERROR))
  })
}

/**
 * Hand everything the built-in initializer doesn't cover to `sanity init`,
 * through the same package runner (npx, pnpm dlx, …) that started us
 */
function delegateToCli(args: string[]): Promise<number> {
  const [command, ...commandArgs] = pinnedCliCommand(CLI_VERSION, [
    'init',
    ...args,
    '--from-create',
  ])
  return runChild(command, commandArgs)
}

const hasProxy = () =>
  ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'].some((key) => process.env[key])

/**
 * Node's `fetch` honors proxy variables only with `NODE_USE_ENV_PROXY`, added
 * in 24.0.0 and backported to 22.21.0 (never to 23.x)
 */
export function supportsEnvProxy(version = process.versions.node): boolean {
  const [major, minor] = version.split('.').map(Number)
  return major === 22 ? minor >= 21 : major >= 24
}

function printError(message: string): void {
  const bang = styleText('red', '›')
  const lines = `Error: ${message}`.split('\n')
  process.stderr.write(`${lines.map((line) => ` ${bang}   ${line}`).join('\n')}\n`)
}

export async function main(rawArgs: string[]): Promise<number> {
  const interactive = isInteractive()
  const args = stripSeparators(rawArgs)
  const parsed = parseInitArgs(args, interactive)
  if (parsed.kind === 'help') {
    process.stdout.write(helpText())
    return 0
  }
  if (parsed.kind === 'error') {
    printError(parsed.message)
    return parsed.exitCode
  }
  if (parsed.kind === 'delegate' || isNextJsProject(process.cwd())) return delegateToCli(args)
  if (hasProxy() && process.env.NODE_USE_ENV_PROXY !== '1') {
    if (!supportsEnvProxy()) return delegateToCli(args)
    // Node warns that its proxy agent is experimental, which isn't actionable here
    const nodeArgs = ['--disable-warning=UNDICI-EHPA', ...process.execArgv]
    return runChild(process.execPath, [...nodeArgs, ...process.argv.slice(1)], {
      ...process.env,
      NODE_USE_ENV_PROXY: '1',
    })
  }

  try {
    await initStudio(parsed.flags, {
      cliVersion: CLI_VERSION,
      interactive,
      templatesDir,
      workDir: process.cwd(),
    })
    return 0
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      process.stderr.write(`${styleText('yellow', '\u{203A}')} Aborted by user\n`)
      return exitCodes.SIGINT
    }
    if (error instanceof InitError) {
      printError(error.message)
      return error.exitCode
    }
    printError(error instanceof Error ? error.message : String(error))
    return exitCodes.RUNTIME_ERROR
  }
}
