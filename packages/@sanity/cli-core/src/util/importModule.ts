import {fileURLToPath, pathToFileURL} from 'node:url'

import {createJiti, type JitiResolveOptions} from 'jiti'

import {subdebug} from '../_exports/debug.js'

interface ImportModuleOptions {
  /**
   * Whether to return the default export of the module.
   * Default: true
   */
  default?: boolean

  /**
   * Whether to transform JSX in the imported module (and anything it imports).
   * Required for `.tsx`/`.jsx` modules — without it they fail to parse.
   * Default: false
   */
  jsx?: boolean

  /**
   * Path to the tsconfig file to use for the import. If not provided, the tsconfig
   * will be inferred from the nearest `tsconfig.json` file.
   */
  tsconfigPath?: string
}

const debug = subdebug('importModule')

/**
 * Imports a module using Jiti and returns its exports.
 *
 * @param filePath - Path to the module to import.
 * @param options - Options for the importModule function.
 * @returns The exported module.
 *
 * @internal
 */
export async function importModule<T = unknown>(
  filePath: string | URL,
  options: ImportModuleOptions = {},
): Promise<T> {
  const {default: returnDefault = true, jsx = false, tsconfigPath} = options

  const jiti = createJiti(import.meta.url, {
    debug: debug.enabled,
    jsx,
    tsconfigPaths: typeof tsconfigPath === 'string' ? tsconfigPath : true,
  })

  const fileURL = typeof filePath === 'string' ? pathToFileURL(filePath) : filePath

  debug(`Loading module: ${fileURLToPath(fileURL)}`, {tsconfigPath})

  const jitiOptions: JitiResolveOptions & {default?: true} = {}

  // If the default option is true, add it to the jiti options
  if (returnDefault) {
    jitiOptions.default = true
  }

  return jiti.import<T>(fileURLToPath(fileURL), jitiOptions)
}
