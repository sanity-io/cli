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
 * @internal
 */
export function createVendorImportMapFromBundle(
  outputBundle: OutputBundle,
  specifiersByChunkName: Record<string, string>,
  basePath: string,
): Record<string, string> {
  const imports: Record<string, string> = {}
  const base = basePath.replace(/\/+$/, '') || ''

  for (const file of Object.values(outputBundle)) {
    if (file.type !== 'chunk' || !file.isEntry) continue

    const specifier = specifiersByChunkName[file.name]
    if (!specifier) continue

    imports[specifier] = [base, file.fileName].filter(Boolean).join('/')
  }

  return imports
}
