import {execFileSync, execSync, type ExecSyncOptions} from 'node:child_process'
import {rmSync} from 'node:fs'
import path from 'node:path'

const defaultCommitMessage = 'feat: bootstrap sanity studio'

export function tryGitInit(rootDir: string, commitMessage?: string): boolean {
  const execOptions: ExecSyncOptions = {cwd: rootDir, stdio: 'ignore'}

  let didInit = false
  try {
    execSync('git --version', execOptions)
    if (isInGitRepository(rootDir) || isInMercurialRepository(rootDir)) {
      return false
    }

    execSync('git init', execOptions)
    didInit = true

    execSync('git checkout -b main', execOptions)

    execSync('git add -A', execOptions)
    execFileSync('git', ['commit', '-m', commitMessage || defaultCommitMessage], {
      cwd: rootDir,
      stdio: 'ignore',
    })
    return true
  } catch {
    if (didInit) {
      try {
        rmSync(path.join(rootDir, '.git'), {force: true, recursive: true})
      } catch {
        // intentional noop
      }
    }
    return false
  }
}

function isInGitRepository(rootDir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {cwd: rootDir, stdio: 'ignore'})
    return true
  } catch {
    // intentional noop
  }
  return false
}

function isInMercurialRepository(rootDir: string): boolean {
  try {
    execSync('hg --cwd . root', {cwd: rootDir, stdio: 'ignore'})
    return true
  } catch {
    // intentional noop
  }
  return false
}
