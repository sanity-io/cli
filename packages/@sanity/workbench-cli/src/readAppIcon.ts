import {relative, resolve, sep} from 'node:path'

import {getErrorMessage} from '@sanity/cli-core/errors'
import {type ImageFile, readImageFile} from '@sanity/cli-core/images'

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
 * The URL path a server rooted at `dir` serves `file` at, without a leading slash.
 * @internal
 */
export function toUrlPath(dir: string, file: string): string {
  return relative(dir, file)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}
