import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {subdebug} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {flagOrDefault, shouldPrompt} from './initHelpers.js'
import {type InitOptions} from './types.js'

const debug = subdebug('init')

export async function writeOrOverwrite(
  filePath: string,
  content: string,
  workDir: string,
  options: InitOptions,
): Promise<void> {
  if (existsSync(filePath)) {
    let overwrite = flagOrDefault(options.overwriteFiles, false)
    if (shouldPrompt(options.unattended, options.overwriteFiles)) {
      overwrite = await confirm({
        default: false,
        message: `File ${styleText(
          'yellow',
          filePath.replace(workDir, ''),
        )} already exists. Do you want to overwrite it?`,
      })
    }

    if (!overwrite) {
      return
    }
  }

  // make folder if not exists
  const folderPath = path.dirname(filePath)

  try {
    await mkdir(folderPath, {recursive: true})
  } catch {
    debug('Error creating folder %s', folderPath)
  }

  await writeFile(filePath, content, {
    encoding: 'utf8',
  })
}

// write sanity folder files
export async function writeSourceFiles({
  fileExtension,
  files,
  folderPath,
  options,
  srcFolderPrefix,
  workDir,
}: {
  fileExtension: string
  files: Record<string, Record<string, string> | string>
  folderPath?: string
  options: InitOptions
  srcFolderPrefix?: boolean
  workDir: string
}): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    // check if file ends with full stop to indicate it's file and not directory (this only works with our template tree structure)
    if (filePath.includes('.') && typeof content === 'string') {
      await writeOrOverwrite(
        path.join(
          workDir,
          srcFolderPrefix ? 'src' : '',
          'sanity',
          folderPath || '',
          `${filePath}${fileExtension}`,
        ),
        content,
        workDir,
        options,
      )
    } else {
      await mkdir(path.join(workDir, srcFolderPrefix ? 'src' : '', 'sanity', filePath), {
        recursive: true,
      })
      if (typeof content === 'object') {
        await writeSourceFiles({
          fileExtension,
          files: content,
          folderPath: filePath,
          options,
          srcFolderPrefix,
          workDir,
        })
      }
    }
  }
}
