import {readFile} from 'node:fs/promises'

import {z} from 'zod'

/**
 * Comprehensive package.json schema including all common properties.
 * Feel free to add properties to this,
 * 🟠ℹ️   BUT ENSURE OPTIONAL STUFF IS ACTUALLY OPTIONAL  ℹ️🟠
 * 🟠ℹ️ SINCE THIS IS USED IN A NUMBER OF LOCATIONS WHERE ℹ️🟠
 * 🟠ℹ️ WE CANNOT ENFORCE/GUARANTEE ANY PARTICULAR PROPS  ℹ️🟠
 */
const packageJsonSchema = z.looseObject({
  // Required fields
  name: z.string(),
  version: z.string(),

  // Dependencies (optional)
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),

  // Module structure (optional)
  exports: z.record(z.string(), z.any()).optional(),
  main: z.string().optional(),
  types: z.string().optional(),

  // Metadata (optional)
  author: z.string().optional(),
  description: z.string().optional(),
  engines: z.record(z.string(), z.string()).optional(),
  license: z.string().optional(),
  private: z.boolean().optional(),
  repository: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  type: z.enum(['module', 'commonjs']).optional(),
})

/**
 * Comprehensive representation of a package.json file.
 * Consolidates all properties from previous type definitions.
 *
 * @public
 */
export type PackageJson = z.infer<typeof packageJsonSchema>

/**
 * Options for reading package.json files
 *
 * @public
 */
export interface ReadPackageJsonOptions {
  /**
   * Default values to merge with the parsed package.json.
   * Parsed values take precedence over defaults.
   */
  defaults?: Partial<PackageJson>

  /**
   * Skip Zod schema validation. When true, the file is parsed but not validated.
   * Defaults to false.
   */
  skipSchemaValidation?: boolean
}

/**
 * Read the `package.json` file at the given path
 *
 * @param filePath - Path to package.json to read
 * @param options - Options object for controlling read behavior
 * @returns The parsed package.json
 * @public
 */
export async function readPackageJson(
  filePath: string | URL,
  options: ReadPackageJsonOptions = {},
): Promise<PackageJson> {
  const {defaults = {}, skipSchemaValidation = false} = options

  // Read and parse the file
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err: unknown) {
    throw new Error(`Failed to read "${filePath}"`, {cause: err})
  }

  // Merge with defaults (parsed values take precedence)
  const merged = {...defaults, ...pkg}

  // Validate with schema unless skipped
  let validated: PackageJson
  if (skipSchemaValidation) {
    validated = merged as PackageJson
  } else {
    const {data, error, success} = packageJsonSchema.safeParse(merged)
    if (!success) {
      throw new Error(
        `Invalid package.json at "${filePath}": ${error.issues.map((err) => err.message).join('\n')}`,
      )
    }
    validated = data
  }

  return validated
}
