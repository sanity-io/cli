import fs from 'node:fs/promises'
import path from 'node:path'

import {skipIfExistsError} from '../../util/copyDir.js'
import {generateWebManifest} from './generateWebManifest.js'

/**
 * @internal
 */
export async function writeWebManifest(basePath: string, destDir: string): Promise<void> {
  const content = JSON.stringify(generateWebManifest(basePath), null, 2)
  await fs
    .writeFile(path.join(destDir, 'manifest.webmanifest'), content, 'utf8')
    .catch(skipIfExistsError)
}
