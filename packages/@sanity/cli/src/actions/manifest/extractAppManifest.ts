import {readFile} from 'node:fs/promises'
import {relative, resolve} from 'node:path'

import {getCliConfig} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import DOMPurify from 'isomorphic-dompurify'

import {getErrorMessage} from '../../util/getErrorMessage.js'
import {config as purifyConfig} from './purifyConfig.js'
import {type AppManifest} from './types.js'

interface ExtractAppManifestOptions {
  workDir: string
}

/**
 * Resolves app.icon from config (a file path) to a sanitized SVG string for the manifest.
 * Uses the same DOMPurify config as Studio icon resolution so we only allow safe SVG.
 * The manifest expects the SVG string inline, not a path.
 */
async function readIconFromPath(workDir: string, iconPath: string): Promise<string> {
  const resolvedPath = resolve(workDir, iconPath)
  const pathRelativeToWorkDir = relative(workDir, resolvedPath)
  if (pathRelativeToWorkDir.startsWith('..')) {
    throw new Error(
      `Icon path "${iconPath}" resolves outside the project directory and is not allowed.`,
    )
  }

  let content: string
  try {
    content = await readFile(resolvedPath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Could not read icon file at "${iconPath}" (resolved: ${resolvedPath}): ${message}`,
    )
  }

  const trimmed = content.trim()
  if (!/<svg[\s>]/i.test(trimmed)) {
    throw new Error(
      `Icon file at "${iconPath}" does not contain an SVG element. App manifest icons must be SVG files.`,
    )
  }

  const sanitized = DOMPurify.sanitize(trimmed, purifyConfig)
  if (!sanitized.trim()) {
    throw new Error(
      `Icon file at "${iconPath}" produced no valid SVG after sanitization. Check that the file contains allowed SVG elements and attributes.`,
    )
  }
  return sanitized.trim()
}

/**
 *
 * This functions slightly differently from the studio manifest extraction function.
 * We don't need to parse very complicated information like schemas and tools.
 * The app icon in config is a file path (e.g. relative to project root); its content is read and inlined in the manifest.
 */
export async function extractAppManifest(
  options: ExtractAppManifestOptions,
): Promise<AppManifest | undefined> {
  const {workDir} = options

  const spin = spinner('Extracting manifest').start()

  try {
    const {app} = await getCliConfig(workDir)
    if (!app) {
      spin.succeed('Manifest creation skipped: no app configuration found')
      return undefined
    }

    let icon: string | undefined
    if (app.icon) {
      icon = await readIconFromPath(workDir, app.icon)
    }

    if (!icon && !app.title) {
      spin.succeed('Manifest creation skipped: no icon or title found in app configuration')
      return undefined
    }

    const manifest: AppManifest = {
      version: '1',
      ...(icon ? {icon} : {}),
      ...(app.title ? {title: app.title} : {}),
    }

    spin.succeed(`Extracted manifest`)

    return manifest
  } catch (err) {
    const message = getErrorMessage(err)
    spin.fail(message)
    throw err
  }
}
