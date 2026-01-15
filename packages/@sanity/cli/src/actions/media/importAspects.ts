import {access, readdir} from 'node:fs/promises'
import path from 'node:path'

import {tryGetDefaultExport} from '@sanity/cli-core'
import {validateMediaLibraryAssetAspect} from '@sanity/schema/_internal'
import {
  isAssetAspect,
  type MediaLibraryAssetAspectDocument,
  type SchemaValidationProblem,
} from '@sanity/types'
import {getTsconfig} from 'get-tsconfig'
import {tsImport} from 'tsx/esm/api'

/**
 * File extensions that are considered valid aspect definition files
 */
const ASPECT_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

/**
 * Type for an aspect that has been validated
 */
interface ValidAspect {
  aspect: MediaLibraryAssetAspectDocument
  filename: string
  status: 'valid'
  validationErrors: never[]
}

/**
 * Type for an aspect that failed validation
 */
interface InvalidAspect {
  aspect: unknown
  filename: string
  status: 'invalid'
  validationErrors: SchemaValidationProblem[][]
}

/**
 * Union type for aspect containers
 */
type AspectContainer = InvalidAspect | ValidAspect

/**
 * Options for importing aspects
 */
interface ImportAspectsOptions {
  /**
   * Path to the directory containing aspect definition files
   */
  aspectsPath: string

  /**
   * Optional filter function to determine which aspects to include
   */
  filterAspects?: (aspect: unknown) => boolean
}

/**
 * Result of importing aspects, grouped by validation status
 */
interface ImportAspectsResult {
  invalid: InvalidAspect[]
  valid: ValidAspect[]
}

/**
 * Import and validate aspect definition files from a directory
 *
 * This function reads all TypeScript/JavaScript files from the specified directory,
 * dynamically imports them using tsx for TypeScript support, validates them,
 * and returns them grouped by validation status.
 *
 * @param options - Options for importing aspects
 * @returns Promise resolving to valid and invalid aspects
 * @internal
 */
export async function importAspects(options: ImportAspectsOptions): Promise<ImportAspectsResult> {
  const {aspectsPath, filterAspects = () => true} = options

  // Check if directory exists
  try {
    await access(aspectsPath)
  } catch {
    throw new Error(`Aspects directory does not exist: ${aspectsPath}`)
  }

  // Read directory entries
  const entries = await readdir(aspectsPath, {withFileTypes: true})

  // Filter for valid aspect files
  const aspectFiles = entries.filter(
    (entry) => entry.isFile() && ASPECT_FILE_EXTENSIONS.has(path.extname(entry.name)),
  )

  // Get tsconfig for TypeScript compilation
  const tsconfig = getTsconfig(aspectsPath)

  // Import and validate all aspect files
  const aspects: AspectContainer[] = []

  for (const file of aspectFiles) {
    const filename = file.name
    const filePath = path.resolve(aspectsPath, filename)

    try {
      // Dynamically import the aspect file with TypeScript support
      const aspectModule = await tsImport(filePath, {
        parentURL: import.meta.url,
        tsconfig: tsconfig?.path,
      })

      // Get the default export
      const maybeAspect = tryGetDefaultExport(aspectModule)

      // Check if user wants to filter this aspect
      if (!filterAspects(maybeAspect)) {
        continue
      }

      // Validate that it's an asset aspect
      if (!isAssetAspect(maybeAspect)) {
        aspects.push({
          aspect: maybeAspect,
          filename,
          status: 'invalid',
          validationErrors: [],
        })
        continue
      }

      // Validate the aspect schema
      const [valid, errors] = validateMediaLibraryAssetAspect(maybeAspect.definition)

      if (!valid) {
        aspects.push({
          aspect: maybeAspect,
          filename,
          status: 'invalid',
          validationErrors: errors,
        })
        continue
      }

      aspects.push({
        aspect: maybeAspect,
        filename,
        status: 'valid',
        validationErrors: [],
      })
    } catch (error) {
      aspects.push({
        aspect: null,
        filename,
        status: 'invalid',
        validationErrors: [
          [
            {
              message: `Failed to import file: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error',
            },
          ],
        ],
      })
    }
  }

  // Group by validation status
  const result: ImportAspectsResult = {
    invalid: aspects.filter((a): a is InvalidAspect => a.status === 'invalid'),
    valid: aspects.filter((a): a is ValidAspect => a.status === 'valid'),
  }

  return result
}
