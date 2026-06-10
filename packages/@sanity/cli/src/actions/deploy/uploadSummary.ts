import {readdir, stat} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'

import {getDeploymentEndpoint} from '../../services/userApplications.js'
import {humanFileSize} from '../../util/humanFileSize.js'
import {deployDebug} from './deployDebug.js'

const MAX_LISTED_FILES = 20

interface LogUploadSummaryOptions {
  applicationId: string
  hasManifest: boolean
  isApp: boolean
  isAutoUpdating: boolean
  output: Output
  version: string

  projectId?: string

  /** Directory the tarball is created from; omit when no tarball is uploaded (external studios) */
  sourceDir?: string
}

/**
 * Tells the user what a deployment uploads to the user-applications service
 * (Brett) and where: the tarball contents, the deployment metadata, and the
 * endpoint. Purely informational — failures to read the source directory are
 * logged at debug level and never block the deploy.
 *
 * @internal
 */
export async function logUploadSummary(options: LogUploadSummaryOptions): Promise<void> {
  const {applicationId, hasManifest, isApp, isAutoUpdating, output, projectId, sourceDir, version} =
    options

  const {query, uri} = getDeploymentEndpoint({applicationId, isApp, projectId})

  output.log(`Upload target: ${styleText('cyan', `POST ${uri}?appType=${query.appType}`)}`)
  output.log(
    `Metadata: version=${version} autoUpdates=${isAutoUpdating} manifest=${hasManifest ? 'included' : 'none'}`,
  )

  if (!sourceDir) {
    output.log('No tarball is uploaded for externally hosted studios.')
    return
  }

  try {
    const files = await collectFiles(sourceDir)
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const fileCount = `${files.length} ${files.length === 1 ? 'file' : 'files'}`
    output.log(`Tarball: ${fileCount}, ${humanFileSize(totalSize)} (from ${sourceDir})`)
    for (const file of files.slice(0, MAX_LISTED_FILES)) {
      output.log(`  ${file.path} ${styleText('dim', `(${humanFileSize(file.size)})`)}`)
    }
    const unlisted = files.length - MAX_LISTED_FILES
    if (unlisted > 0) {
      output.log(`  …and ${unlisted} more ${unlisted === 1 ? 'file' : 'files'}`)
    }
  } catch (err) {
    deployDebug('Could not summarize tarball contents', err)
  }
}

async function collectFiles(sourceDir: string): Promise<{path: string; size: number}[]> {
  const entries = await readdir(sourceDir, {recursive: true, withFileTypes: true})
  const files: {path: string; size: number}[] = []

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const absolutePath = join(entry.parentPath, entry.name)
    const {size} = await stat(absolutePath)
    files.push({path: relative(sourceDir, absolutePath), size})
  }

  return files.toSorted((a, b) => a.path.localeCompare(b.path))
}
