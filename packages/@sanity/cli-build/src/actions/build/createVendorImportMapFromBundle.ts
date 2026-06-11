import path from 'node:path'

interface OutputChunk {
  fileName: string
  isEntry: boolean
  name: string
  type: 'chunk'
}

interface OutputBundle {
  [fileName: string]: OutputChunk | {type: 'asset'}
}

/**
 * Builds the vendor portion of an import map from emitted Rolldown chunks.
 *
 * The returned paths are absolute (rooted at the served `basePath`) so the
 * browser can resolve the bare specifiers in the emitted import map regardless
 * of the document's location.
 *
 * @internal
 */
export function createVendorImportMapFromBundle(
  outputBundle: OutputBundle,
  specifiersByChunkName: Record<string, string>,
  basePath: string,
): Record<string, string> {
  const imports: Record<string, string> = {}

  for (const file of Object.values(outputBundle)) {
    if (file.type !== 'chunk' || !file.isEntry) continue

    const specifier = specifiersByChunkName[file.name]
    if (!specifier) continue

    imports[specifier] = path.posix.join('/', basePath, file.fileName)
  }

  return imports
}
