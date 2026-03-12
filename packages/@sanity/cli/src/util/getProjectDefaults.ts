import fs from 'node:fs/promises'
import path from 'node:path'

import {getCliToken, subdebug} from '@sanity/cli-core'

import {getCliUser} from '../services/user.js'
import {getGitRemoteOriginUrl, getGitUserInfo} from './gitConfig.js'

const debug = subdebug('getProjectDefaults')

interface ProjectDefaults {
  author: string | undefined
  description: string
  gitRemote: string | undefined
  license: string
  projectName: string
}

/**
 * Gathers sensible defaults for a new Sanity project by reading git config,
 * the current Sanity user, and the local directory/README. Used to pre-fill
 * prompts during `sanity init`.
 *
 * @internal
 */
export async function getProjectDefaults({
  isPlugin,
  workDir,
}: {
  isPlugin: boolean
  workDir: string
}): Promise<ProjectDefaults> {
  const cwd = process.cwd()
  const isSanityRoot = workDir === cwd

  const [author, gitRemote, description] = await Promise.all([
    getUserInfo(),
    isPlugin && isSanityRoot ? undefined : getGitRemoteOriginUrl(cwd),
    getProjectDescription({isPlugin, isSanityRoot, outputDir: cwd}),
  ])

  return {
    author,
    description,
    gitRemote,
    license: 'UNLICENSED',
    projectName: isPlugin && isSanityRoot ? '' : path.basename(cwd),
  }
}

async function getUserInfo(): Promise<string | undefined> {
  const user = await getGitUserInfo()
  if (user) {
    return `${user.name} <${user.email}>`
  }

  return getSanityUserInfo()
}

async function getSanityUserInfo(): Promise<string | undefined> {
  const hasToken = Boolean(getCliToken())
  if (!hasToken) {
    return undefined
  }

  try {
    const user = await getCliUser()
    return user ? `${user.name} <${user.email}>` : undefined
  } catch {
    return undefined
  }
}

async function getProjectDescription({
  isPlugin,
  isSanityRoot,
  outputDir,
}: {
  isPlugin: boolean
  isSanityRoot: boolean
  outputDir: string
}): Promise<string> {
  const tryResolve = isSanityRoot && !isPlugin
  if (!tryResolve) {
    return ''
  }

  // Try to grab a project description from a standard GitHub-generated readme
  try {
    const readmePath = path.join(outputDir, 'README.md')
    const readme = await fs.readFile(readmePath, {encoding: 'utf8'})
    const match = readme.match(/^# .*?\n+(\w.*?)(?:$|\n)/)
    return ((match && match[1]) || '').replace(/\.$/, '') || ''
  } catch (err) {
    debug(`Error getting project description: ${err}`)
    return ''
  }
}
