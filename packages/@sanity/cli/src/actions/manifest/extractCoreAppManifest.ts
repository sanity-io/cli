import {readFile} from 'node:fs/promises'
import {relative, resolve} from 'node:path'

import {doImport, getCliConfigUncached} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {getErrorMessage} from '../../util/getErrorMessage.js'
import {type sanitizeIcon as sanitizeIconFn} from './sanitizeIcon.js'
import {type CoreAppManifest, coreAppManifestSchema} from './types.js'

interface ExtractCoreAppManifestOptions {
  workDir: string
}

/**
 * The title change a deploy would sync from the manifest to the user
 * application, or null when the titles already match (or none is set).
 *
 * @internal
 */
export function resolveTitleUpdate(
  manifest: CoreAppManifest | undefined,
  application: {title: string | null},
): {from: string | null; to: string} | null {
  if (manifest?.title === undefined || manifest.title === application.title) {
    return null
  }
  return {from: application.title, to: manifest.title}
}

const sanitizeIconPath = new URL('sanitizeIcon.js', import.meta.url).href

/**
 * Lazy-load {@link sanitizeIconFn} so `isomorphic-dompurify` (and its jsdom
 * dependency) stays out of the CLI's eager import graph. The studio manifest
 * resolver lazy-loads its icon machinery for the same reason; this path runs in
 * the main process (not the manifest worker), so only an app deploy that
 * actually has an icon pays the cost.
 */
async function lazySanitizeIcon(): Promise<typeof sanitizeIconFn> {
  const mod = await doImport(sanitizeIconPath)
  return mod.sanitizeIcon
}

/**
 * Resolves app.icon from config (a file path) to an SVG string for the manifest.
 * The manifest expects the SVG string inline, not a path.
 *
 * The file is sanitized through the same allowlist as the studio manifest's
 * icon resolver (see {@link lazySanitizeIcon}) so both manifest paths inline the
 * same trusted subset of SVG markup.
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
      {cause: err},
    )
  }

  const trimmed = content.trim()
  if (!/<svg[\s>]/i.test(trimmed)) {
    throw new Error(
      `Icon file at "${iconPath}" does not contain an SVG element. App manifest icons must be SVG files.`,
    )
  }

  const sanitizeIcon = await lazySanitizeIcon()
  return sanitizeIcon(trimmed)
}

/**
 * Unlike studio manifest extraction, skips schema/tool parsing. The config's
 * `app.icon` is a file path; its content is read and inlined in the manifest.
 */
export async function extractCoreAppManifest(
  options: ExtractCoreAppManifestOptions,
): Promise<CoreAppManifest | undefined> {
  const {workDir} = options
  const {app} = await getCliConfigUncached(workDir)
  if (!app) {
    return undefined
  }

  const spin = spinner('Extracting manifest').start()

  try {
    let icon: string | undefined
    if (app.icon) {
      icon = await readIconFromPath(workDir, app.icon)
    }

    if (!icon && !app.title) {
      spin.succeed('Manifest creation skipped: no icon or title found in app configuration')
      return undefined
    }

    const manifest: CoreAppManifest = coreAppManifestSchema.parse({
      version: '1',
      ...(icon ? {icon} : {}),
      ...(app.title ? {title: app.title} : {}),
      ...(app.group ? {group: app.group} : {}),
      ...(app.priority === undefined ? {} : {priority: app.priority}),
    })

    spin.succeed(`Extracted manifest`)

    return manifest
  } catch (err) {
    const message = getErrorMessage(err)
    spin.fail(message)
    throw err
  }
}
