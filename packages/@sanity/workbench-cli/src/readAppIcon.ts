import {relative, resolve, sep} from 'node:path'

import {type CliConfig} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type ImageFile, readImageFile} from '@sanity/cli-core/images'

import {isWorkbenchApp} from './defineApp.js'

/**
 * An app's or view's `icon` image, read from its project.
 * @internal
 */
export interface AppIcon extends ImageFile {
  /** Absolute path to the file. */
  file: string
}

/**
 * Read the image an `icon` path points at. The path is relative to the project
 * root and must stay inside it.
 * @internal
 */
export async function readAppIcon(workDir: string, iconPath: string): Promise<AppIcon> {
  const file = resolve(workDir, iconPath)
  if (relative(workDir, file).startsWith('..')) {
    throw new Error(
      `Icon "${iconPath}" is outside the project directory. Move the image into the project and update the icon path in sanity.cli.ts.`,
    )
  }

  try {
    return {...(await readImageFile(file)), file}
  } catch (err) {
    throw new Error(`Can't use icon "${iconPath}": ${getErrorMessage(err)}`, {cause: err})
  }
}

/**
 * A window or panel view's icon, keyed like the Brett interface it belongs to.
 * @internal
 */
export interface ViewIcon {
  icon: AppIcon
  name: string
  type: 'app' | 'panel'
}

/** @internal */
export async function readViewIcons(workDir: string, app: CliConfig['app']): Promise<ViewIcon[]> {
  if (!isWorkbenchApp(app)) return []

  return Promise.all(
    (app.views ?? []).flatMap((view) =>
      (view.surface === 'window' || view.surface === 'panel') && view.icon
        ? [
            readAppIcon(workDir, view.icon).then((icon) => ({
              icon,
              name: view.name,
              type: view.surface === 'window' ? ('app' as const) : view.surface,
            })),
          ]
        : [],
    ),
  )
}

/**
 * The URL path a server rooted at `dir` serves `file` at, without a leading slash.
 * @internal
 */
export function toUrlPath(dir: string, file: string): string {
  return relative(dir, file)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}
