import fs from 'node:fs/promises'
import path from 'node:path'

import getGitConfig from '@rexxars/gitconfiglocal'
import {getCliToken, subdebug} from '@sanity/cli-core'
import {getGitUserInfo} from 'git-user-info'
import promiseProps from 'promise-props-recursive'

import {getCliUser} from '../services/user.js'

const debug = subdebug('getProjectDefaults')

interface ProjectDefaults {
  author: string | undefined
  description: string
  gitRemote: string
  license: string
  projectName: string
}

export function getProjectDefaults({
  isPlugin,
  workDir,
}: {
  isPlugin: boolean
  workDir: string
}): Promise<ProjectDefaults> {
  const cwd = process.cwd()
  const isSanityRoot = workDir === cwd

  return promiseProps({
    license: 'UNLICENSED',

    author: getUserInfo(),

    // Don't try to use git remote from main Sanity project for plugins
    gitRemote: isPlugin && isSanityRoot ? '' : resolveGitRemote(cwd),

    // Don't try to guess plugin name if we're initing from Sanity root
    projectName: isPlugin && isSanityRoot ? '' : path.basename(cwd),

    // If we're initing a plugin, don't use description from Sanity readme
    description: getProjectDescription({isPlugin, isSanityRoot, outputDir: cwd}),
  })
}

async function resolveGitRemote(cwd: string): Promise<string | undefined> {
  try {
    await fs.stat(path.join(cwd, '.git'))
    const cfg = await getGitConfig(cwd)
    return cfg.remote && cfg.remote.origin && cfg.remote.origin.url
  } catch {
    return undefined
  }
}

async function getUserInfo(): Promise<string | undefined> {
  const user = await getGitUserInfo()
  if (!user) {
    return getSanityUserInfo()
  }

  if (user.name && user.email) {
    return `${user.name} <${user.email}>`
  }

  return undefined
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
