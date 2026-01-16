import os from 'node:os'

/**
 * Apparently, Windows environment variables are supposed to be case-insensitive,
 * (https://nodejs.org/api/process.html#processenv). However, it seems they are not?
 * `process.env.SYSTEMROOT` is sometimes `undefined`, whereas `process.env.SystemRoot` is _NOT_.
 *
 * The `open` npm module uses the former to open a browser on Powershell, and Sindre seems
 * unwilling to fix it (https://github.com/sindresorhus/open/pull/299#issuecomment-1447587598),
 * so this is a (temporary?) workaround in order to make opening browsers on windows work,
 * which several commands does (`sanity login`, `sanity docs` etc)
 */
export function maybeFixMissingWindowsEnvVar() {
  if (os.platform() === 'win32' && !('SYSTEMROOT' in process.env) && 'SystemRoot' in process.env) {
    process.env.SYSTEMROOT = process.env.SystemRoot
  }
}
