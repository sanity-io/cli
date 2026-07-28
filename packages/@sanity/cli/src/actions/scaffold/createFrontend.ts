import path from 'node:path'

import {type Output, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {installNewPackages} from '../../util/packageManager/installPackages.js'
import {
  getPartialEnvWithNpmPath,
  type PackageManager,
} from '../../util/packageManager/packageManagerChoice.js'

const debug = subdebug('scaffold')

const CREATE_NEXT_APP_SPEC = 'create-next-app@^16'

const NEXT_SANITY_SPEC = 'next-sanity@13'

const packageManagerFlag: Record<PackageManager, string | undefined> = {
  bun: '--use-bun',
  manual: undefined,
  npm: '--use-npm',
  pnpm: '--use-pnpm',
  yarn: '--use-yarn',
}

// Explicit rather than left to `--yes`, which replays whatever preferences `create-next-app` saved
// from an earlier run on this machine.
const scaffolderFlags = [
  '--typescript',
  '--app',
  '--eslint',
  '--tailwind',
  '--no-src-dir',
  '--disable-git',
  '--yes',
]

// The leading `--yes` is npx's own confirmation; one placed after the spec goes to create-next-app.
function scaffolderArgs(dirName: string, packageManager?: PackageManager): string[] {
  const pmFlag = packageManager ? packageManagerFlag[packageManager] : undefined
  return ['--yes', CREATE_NEXT_APP_SPEC, dirName, ...scaffolderFlags, ...(pmFlag ? [pmFlag] : [])]
}

export function frontendScaffoldCommand(dirName: string): string {
  return `npx ${scaffolderArgs(dirName).join(' ')}`
}

export class FrontendScaffoldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrontendScaffoldError'
  }
}

// Closed stdin is what guarantees no prompt can wait for a human, rather than trusting the flags.
export async function createFrontend({
  dirName,
  output,
  packageManager,
  workDir,
}: {
  dirName: string
  output: Output
  packageManager: PackageManager
  workDir: string
}): Promise<void> {
  const args = scaffolderArgs(dirName, packageManager)

  debug('Scaffolding frontend: npx %s', args.join(' '))

  const progress = spinner('Creating your Next.js app\n').start()
  let result
  try {
    result = await execa('npx', args, {
      cwd: workDir,
      encoding: 'utf8',
      env: {
        ...getPartialEnvWithNpmPath(workDir),
        npm_config_yes: 'true',
      },
      reject: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    progress.fail()
    throw new FrontendScaffoldError(
      `create-next-app failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (result.failed || result.exitCode) {
    progress.fail()
    const commandOutput = [result.stdout, result.stderr]
      .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.length > 0)
      .join('\n')
    if (commandOutput) output.log(commandOutput)
    throw new FrontendScaffoldError(
      `create-next-app failed${result.exitCode ? ` with exit code ${result.exitCode}` : ''}`,
    )
  }

  progress.succeed()
}

export async function installFrontendDeps({
  dirName,
  output,
  packageManager,
  workDir,
}: {
  dirName: string
  output: Output
  packageManager: PackageManager
  workDir: string
}): Promise<void> {
  try {
    await installNewPackages(
      {packageManager, packages: [NEXT_SANITY_SPEC]},
      {output, workDir: path.join(workDir, dirName)},
    )
  } catch (err) {
    throw new FrontendScaffoldError(
      `Installing next-sanity failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
