import {execFile} from 'node:child_process'

/**
 * Reads `user.name` and `user.email` from git config, resolving through
 * git's full config chain (system, global, local, worktree).
 *
 * Returns `null` if either value is missing or git is not available.
 *
 * @internal
 */
export async function getGitUserInfo(): Promise<{email: string; name: string} | null> {
  const [name, email] = await Promise.all([gitConfigGet('user.name'), gitConfigGet('user.email')])
  return name && email ? {email, name} : null
}

/**
 * Reads the `remote.origin.url` from git config for the repository at {@link cwd}.
 *
 * Returns `undefined` if no remote is configured or git is not available.
 *
 * @internal
 */
export async function getGitRemoteOriginUrl(cwd: string): Promise<string | undefined> {
  return gitConfigGet('remote.origin.url', {cwd})
}

function gitConfigGet(key: string, options?: {cwd?: string}): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['config', '--get', key],
      {cwd: options?.cwd, timeout: 5000},
      (error, stdout) => {
        resolve(error ? undefined : stdout.trim() || undefined)
      },
    )
  })
}
