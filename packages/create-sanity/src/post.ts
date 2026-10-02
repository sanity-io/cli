import {execFileSync, execSync, spawn} from 'node:child_process'
import {existsSync, rmSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import {pinnedCliCommand, spawnArgs} from './runner.js'
import {output} from './ui.js'

const DEFAULT_COMMIT_MESSAGE = 'feat: bootstrap sanity studio'

/** Initialize a git repository with an initial commit, unless already inside one */
export function tryGitInit(rootDir: string, commitMessage?: string): boolean {
  const quiet = {cwd: rootDir, stdio: 'ignore'} as const
  const succeeds = (command: string) => {
    try {
      execSync(command, quiet)
      return true
    } catch {
      return false
    }
  }

  let didInit = false
  try {
    execSync('git --version', quiet)
    if (succeeds('git rev-parse --is-inside-work-tree') || succeeds('hg --cwd . root')) return false
    execSync('git init', quiet)
    didInit = true
    execSync('git checkout -b main', quiet)
    execSync('git add -A', quiet)
    execFileSync('git', ['commit', '-m', commitMessage || DEFAULT_COMMIT_MESSAGE], quiet)
    return true
  } catch {
    if (didInit) rmSync(path.join(rootDir, '.git'), {force: true, recursive: true})
    return false
  }
}

/** Non-production environments (e.g. staging) are recorded in `.env` for the Studio */
export async function writeStagingEnvIfNeeded(outputPath: string): Promise<void> {
  const env = process.env.SANITY_INTERNAL_ENV ?? 'production'
  if (env === 'production') return
  const file = path.join(outputPath, '.env')
  const line = `SANITY_INTERNAL_ENV=${env}`
  const existing = await fs.readFile(file, 'utf8').catch(() => '')
  const pattern = /^SANITY_INTERNAL_ENV=.*$/m
  const updated = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${line}\n`
  await fs.writeFile(file, updated)
}

/**
 * Run a `sanity` CLI command for the new project: its own installed CLI when
 * dependencies were installed, otherwise a temporary `@sanity/cli`.
 */
export function runProjectCli(
  outputPath: string,
  args: string[],
  options: {cliVersion: string; interactive: boolean},
): Promise<number> {
  const bin = path.join(
    outputPath,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'sanity.cmd' : 'sanity',
  )
  const [command, ...commandArgs] = existsSync(bin)
    ? [bin, ...args]
    : pinnedCliCommand(options.cliVersion, args)
  const spawned = spawnArgs(command, commandArgs)
  return new Promise((resolve) => {
    const child = spawn(spawned.command, spawned.args, {
      cwd: outputPath,
      shell: spawned.shell,
      stdio: [options.interactive ? 'inherit' : 'ignore', 'inherit', 'inherit'],
    })
    child.on('error', (error) => {
      output.warn(`Could not run \`sanity ${args.join(' ')}\`: ${error.message}`)
      resolve(1)
    })
    child.on('close', (code) => resolve(code ?? 1))
  })
}
