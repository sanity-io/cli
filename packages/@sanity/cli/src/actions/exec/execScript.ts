import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import {packageDirectory} from 'pkg-dir'

interface ExecScriptOptions {
  extraArguments: string[]
  flags: {
    'mock-browser-env': boolean
    'with-user-token': boolean
  }
  scriptPath: string
  workDir: string
}

export async function execScript(options: ExecScriptOptions): Promise<void> {
  const {extraArguments, flags, scriptPath, workDir} = options
  const mockBrowserEnv = flags['mock-browser-env']
  const withUserToken = flags['with-user-token']

  const resolvedScriptPath = path.resolve(scriptPath)

  if (!(await fs.stat(resolvedScriptPath).catch(() => false))) {
    throw new Error(`${resolvedScriptPath} does not exist`)
  }

  const cliPkgDir = await packageDirectory({cwd: __dirname})
  if (!cliPkgDir) {
    throw new Error('Unable to resolve @sanity/cli module root')
  }

  const threadsDir = path.join(cliPkgDir, 'dist', 'threads')
  const browserEnvPath = path.join(threadsDir, 'registerBrowserEnv.js')
  const configClientPath = path.join(threadsDir, 'configClient.js')

  // Verify threads directory exists
  if (!(await fs.stat(threadsDir).catch(() => false))) {
    throw new Error('@sanity/cli module build error: missing threads directory')
  }

  // Use tsx/register for TypeScript support instead of separate esbuild thread
  const baseArgs = mockBrowserEnv ? ['--import', browserEnvPath] : ['-r', 'tsx/register']
  const tokenArgs = withUserToken ? ['-r', configClientPath] : []

  const nodeArgs = [...baseArgs, ...tokenArgs, resolvedScriptPath, ...extraArguments]

  const proc = spawn(process.argv[0], nodeArgs, {
    env: {
      ...process.env,
      SANITY_BASE_PATH: workDir,
    },
    stdio: 'inherit',
  })
  proc.on('close', process.exit)
}
