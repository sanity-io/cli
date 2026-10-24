import {readFile} from 'node:fs/promises'
import {basename, extname} from 'node:path'

import {type Context} from '@sanity/client'

const FILE_CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gz': 'application/gzip',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.json': 'application/json',
  '.markdown': 'text/markdown',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.tar': 'application/x-tar',
  '.tgz': 'application/gzip',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
}

/**
 * Read a local file for upload to a `files` source. The Context API signs the
 * upload URL for a content type, so one is always sent: the given one, or one
 * inferred from the file extension.
 */
export async function readSourceFile(
  filePath: string,
  contentType?: string,
): Promise<Context.SourceFileUpload> {
  const file = await readFile(filePath)
  return {
    contentType:
      contentType ??
      FILE_CONTENT_TYPES[extname(filePath).toLowerCase()] ??
      'application/octet-stream',
    file,
    filename: basename(filePath),
  }
}
